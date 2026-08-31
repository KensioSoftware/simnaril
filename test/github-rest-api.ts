import {
  SimApi,
  SimEnvironment,
  SimResource,
  type RestResource,
} from "../src/index.js";
import { githubRateLimitFactory } from "./github-rest-api-factories.js";
import { createGitHubIssues } from "./github-rest-api-issues.js";
import {
  addRateLimitHeaders,
  conditionallyCache,
  paginate,
} from "./github-rest-api-middleware.js";
import type {
  GitHubGist,
  GitHubIssue,
  GitHubRateLimit,
  GitHubRepository,
} from "./github-rest-api-types.js";

export type {
  GitHubGist,
  GitHubIssue,
  GitHubRateLimit,
  GitHubRepository,
} from "./github-rest-api-types.js";
export {
  githubGistFactory,
  githubIssueFactory,
  githubRepositoryFactory,
} from "./github-rest-api-factories.js";

const githubOrigin = "https://api.github.com";

export interface SimGitHub extends Disposable {
  api: SimApi;
  environment: SimEnvironment;
  gists: RestResource<GitHubGist>;
  issues: RestResource<GitHubIssue>;
  rateLimits: SimResource<GitHubRateLimit>;
  repositories: RestResource<GitHubRepository>;
}

export const createGitHubRestApi = (): SimGitHub => {
  const environment = new SimEnvironment();
  const api = new SimApi();
  const rateLimits = new SimResource<GitHubRateLimit>({ name: "rate limit" });
  rateLimits.seed(githubRateLimitFactory.make());
  api.use(addRateLimitHeaders(rateLimits));

  const repositories = api.resource<GitHubRepository>({
    identify: (repository) => String(repository.id),
    name: "repository",
    path: "/repositories",
  });

  const issues = createGitHubIssues(api, githubOrigin);

  const gists = api.resource<GitHubGist>({
    create: (input) => {
      const id = crypto.randomUUID().replaceAll("-", "");
      return {
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        files: input.files ?? {},
        html_url: `https://gist.github.com/${id}`,
        id,
        public: input.public ?? false,
        updated_at: new Date().toISOString(),
        url: `${githubOrigin}/gists/${id}`,
      };
    },
    name: "gist",
    path: "/gists",
  });
  gists.operations.list.use(paginate);
  gists.operations.get.use(conditionallyCache);

  environment.register(githubOrigin, api);

  return {
    api,
    environment,
    gists,
    issues,
    rateLimits,
    repositories,
    [Symbol.dispose]() {
      environment.dispose();
    },
  };
};
