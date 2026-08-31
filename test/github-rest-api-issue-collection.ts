import type { RestResource } from "../src/index.js";
import { pathParameter } from "./github-rest-api-issue-identity.js";
import { paginate } from "./github-rest-api-middleware.js";
import type { GitHubIssue } from "./github-rest-api-types.js";

const nextIssueNumber = (
  issues: readonly GitHubIssue[],
  repositoryUrl: string,
): number => {
  let highestNumber = 0;

  for (const issue of issues) {
    if (issue.repository_url === repositoryUrl) {
      highestNumber = Math.max(highestNumber, issue.number);
    }
  }

  return highestNumber + 1;
};

export const configureIssueCollection = (
  issues: RestResource<GitHubIssue>,
  githubOrigin: string,
): void => {
  issues.operations.list.override({
    handle({ params, resource }) {
      const repositoryUrl = `${githubOrigin}/repos/${pathParameter(params, "owner")}/${pathParameter(params, "repository")}`;
      return resource
        .list()
        .filter((issue) => issue.repository_url === repositoryUrl);
    },
  });
  issues.operations.list.use(paginate);

  let nextIssueId = 1_000_000;
  issues.operations.create.override({
    handle({ input, params, resource }) {
      const owner = pathParameter(params, "owner");
      const repository = pathParameter(params, "repository");
      const repositoryUrl = `${githubOrigin}/repos/${owner}/${repository}`;
      const number = nextIssueNumber(resource.list(), repositoryUrl);
      const issue: GitHubIssue = {
        ...(input.body === undefined ? {} : { body: input.body }),
        id: nextIssueId,
        number,
        repository_url: repositoryUrl,
        state: "open",
        title: input.title ?? "",
        updated_at: new Date().toISOString(),
        url: `${repositoryUrl}/issues/${number}`,
      };
      nextIssueId += 1;
      return resource.create(issue);
    },
  });
};
