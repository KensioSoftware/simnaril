import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  createGitHubRestApi,
  githubGistFactory,
  githubIssueFactory,
  githubRepositoryFactory,
  type GitHubIssue,
} from "#test/github-rest-api.js";

describe("the GitHub REST API fixture", () => {
  const productionGitHubConfiguration = {
    baseUrl: "https://api.github.com",
    token: faker.string.alphanumeric(40),
  };

  const githubRequest = (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const headers = new Headers({
      accept: "application/vnd.github+json",
      authorization: `Bearer ${productionGitHubConfiguration.token}`,
      "x-github-api-version": "2022-11-28",
    });
    for (const [name, value] of new Headers(init.headers)) {
      headers.set(name, value);
    }

    return fetch(`${productionGitHubConfiguration.baseUrl}${path}`, {
      ...init,
      headers,
    });
  };

  it("serves arranged repository state at GitHub's production origin", async () => {
    // Given a repository in a composed GitHub simulation.
    using github = createGitHubRestApi();
    const expected = githubRepositoryFactory.make();
    github.repositories.seed(expected);

    // When application code uses its production GitHub configuration.
    const response = await githubRequest(`/repositories/${expected.id}`);

    // Then the request reads the arranged world state.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), expected);
  });

  it("persists issue creation and updates in repository-scoped state", async () => {
    // Given one issue in a repository and another repository with its own issue.
    using github = createGitHubRestApi();
    const owner = faker.internet.username();
    const repositoryName = faker.word.noun();
    const existing = githubIssueFactory.make({
      number: 1,
      owner,
      repositoryName,
    });
    const unrelated = githubIssueFactory.make({ number: 1 });
    github.issues.seed(existing);
    github.issues.seed(unrelated);
    const title = faker.lorem.sentence();
    const body = faker.lorem.paragraph();

    // When application code creates an issue, closes it, and lists the repository.
    const createdResponse = await githubRequest(
      `/repos/${owner}/${repositoryName}/issues`,
      {
        body: JSON.stringify({ body, title }),
        method: "POST",
      },
    );
    const created = (await createdResponse.json()) as GitHubIssue;
    const updatedResponse = await githubRequest(
      `/repos/${owner}/${repositoryName}/issues/${created.number}`,
      {
        body: JSON.stringify({ state: "closed" }),
        method: "PATCH",
      },
    );
    const listedResponse = await githubRequest(
      `/repos/${owner}/${repositoryName}/issues`,
    );

    // Then later calls and direct inspection see the same changes.
    assertResponseStatus(createdResponse, 201);
    assertIdentical(created.number, 2);
    assertIdentical(created.title, title);
    assertIdentical(created.body, body);
    assertResponseStatus(updatedResponse, 200);
    assertObjectEquals(await updatedResponse.json(), {
      ...created,
      state: "closed",
      updated_at: github.issues.get(`${owner}/${repositoryName}#2`).updated_at,
    });
    assertObjectEquals(await listedResponse.json(), [
      existing,
      github.issues.get(`${owner}/${repositoryName}#2`),
    ]);
    assertArrayLength(github.issues.list(), 3);
    assertIdentical(
      github.issues.get(`${owner}/${repositoryName}#2`).state,
      "closed",
    );
  });

  it("paginates collection responses with GitHub link headers", async () => {
    // Given more gists than one requested page can hold.
    using github = createGitHubRestApi();
    const arranged = [
      githubGistFactory.make(),
      githubGistFactory.make(),
      githubGistFactory.make(),
    ];
    for (const item of arranged) {
      github.gists.seed(item);
    }

    // When application code follows the first page's next link.
    const firstResponse = await githubRequest("/gists?per_page=2&page=1");
    const link = firstResponse.headers.get("link") ?? "";
    const nextUrl = /<([^>]+)>; rel="next"/u.exec(link)?.[1] ?? "";
    const secondResponse = await fetch(nextUrl, {
      headers: {
        authorization: `Bearer ${productionGitHubConfiguration.token}`,
      },
    });

    // Then each page contains its slice and names the other page.
    assertResponseStatus(firstResponse, 200);
    assertObjectEquals(await firstResponse.json(), arranged.slice(0, 2));
    assertStringIncludes(link, 'rel="next"');
    assertStringIncludes(link, 'rel="last"');
    const parsedNextUrl = new URL(nextUrl);
    assertIdentical(
      parsedNextUrl.origin + parsedNextUrl.pathname,
      "https://api.github.com/gists",
    );
    assertIdentical(parsedNextUrl.searchParams.get("page"), "2");
    assertIdentical(parsedNextUrl.searchParams.get("per_page"), "2");
    assertResponseStatus(secondResponse, 200);
    assertObjectEquals(await secondResponse.json(), arranged.slice(2));
    assertStringIncludes(
      secondResponse.headers.get("link") ?? "",
      'rel="prev"',
    );
  });

  it("honours conditional requests until resource state changes", async () => {
    // Given a gist whose current representation has been fetched.
    using github = createGitHubRestApi();
    const arranged = githubGistFactory.make();
    github.gists.seed(arranged);
    const firstResponse = await githubRequest(`/gists/${arranged.id}`);
    const etag = firstResponse.headers.get("etag") ?? "";
    await firstResponse.body?.cancel();

    // When the representation is requested conditionally, then changed.
    const unchangedResponse = await githubRequest(`/gists/${arranged.id}`, {
      headers: { "if-none-match": etag },
    });
    github.gists.update(arranged.id, { description: faker.lorem.sentence() });
    const changedResponse = await githubRequest(`/gists/${arranged.id}`, {
      headers: { "if-none-match": etag },
    });

    // Then the old validator suppresses only the unchanged representation.
    assertResponseStatus(unchangedResponse, 304);
    assertIdentical(await unchangedResponse.text(), "");
    assertResponseStatus(changedResponse, 200);
    assertFalse(changedResponse.headers.get("etag") === etag);
    assertObjectEquals(
      await changedResponse.json(),
      github.gists.get(arranged.id),
    );
  });

  it("records rate-limit use in persistent world state", async () => {
    // Given a GitHub simulation with its core rate limit arranged by the composition root.
    using github = createGitHubRestApi();
    const expected = githubRepositoryFactory.make();
    github.repositories.seed(expected);

    // When application code makes two requests.
    await githubRequest(`/repositories/${expected.id}`);
    const response = await githubRequest(`/repositories/${expected.id}`);

    // Then the headers and inspectable rate-limit resource agree.
    assertIdentical(response.headers.get("x-ratelimit-limit"), "5000");
    assertIdentical(response.headers.get("x-ratelimit-remaining"), "4998");
    assertIdentical(response.headers.get("x-ratelimit-resource"), "core");
    assertIdentical(response.headers.get("x-ratelimit-used"), "2");
    assertObjectEquals(github.rateLimits.get("core"), {
      ...github.rateLimits.get("core"),
      remaining: 4998,
      used: 2,
    });
  });
});
