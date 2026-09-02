import {
  requirePathParameter,
  type RestResource,
  type SimApi,
} from "../src/index.js";
import { configureIssueCollection } from "./github-rest-api-issue-collection.js";
import {
  identityForIssue,
  issueIdentity,
} from "./github-rest-api-issue-identity.js";
import { configureIssueItem } from "./github-rest-api-issue-item.js";
import type { GitHubIssue } from "./github-rest-api-types.js";

export const createGitHubIssues = (
  api: SimApi,
  githubOrigin: string,
): RestResource<GitHubIssue> => {
  const issues = api.resource<GitHubIssue>({
    identify: identityForIssue,
    itemPath: "/:number",
    locate: (params) =>
      issueIdentity(
        requirePathParameter(params, "owner"),
        requirePathParameter(params, "repository"),
        Number(requirePathParameter(params, "number")),
      ),
    name: "issue",
    operations: {
      delete: false,
    },
    path: "/repos/:owner/:repository/issues",
  });
  configureIssueCollection(issues, githubOrigin);
  configureIssueItem(issues);

  return issues;
};
