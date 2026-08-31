import type { RestResource, SimApi } from "../src/index.js";
import { configureIssueCollection } from "./github-rest-api-issue-collection.js";
import { identityForIssue } from "./github-rest-api-issue-identity.js";
import { configureIssueItem } from "./github-rest-api-issue-item.js";
import type { GitHubIssue } from "./github-rest-api-types.js";

export const createGitHubIssues = (
  api: SimApi,
  githubOrigin: string,
): RestResource<GitHubIssue> => {
  const issues = api.resource<GitHubIssue>({
    identify: identityForIssue,
    name: "issue",
    operations: {
      create: { path: "/:owner/:repository/issues" },
      delete: { path: "/:owner/:repository/issues/:id" },
      get: { path: "/:owner/:repository/issues/:id" },
      list: { path: "/:owner/:repository/issues" },
      update: { path: "/:owner/:repository/issues/:id" },
    },
    path: "/repos",
  });
  configureIssueCollection(issues, githubOrigin);
  configureIssueItem(issues);

  return issues;
};
