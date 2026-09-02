import type { GitHubIssue } from "./github-rest-api-types.js";

export const issueIdentity = (
  owner: string,
  repository: string,
  number: number,
): string => `${owner}/${repository}#${number}`;

export const identityForIssue = (issue: GitHubIssue): string => {
  const repositoryUrl = new URL(issue.repository_url);
  const [, repos, owner, repository] = repositoryUrl.pathname.split("/");

  if (repos !== "repos" || owner === undefined || repository === undefined) {
    throw new TypeError(
      `Expected a GitHub repository URL, received "${issue.repository_url}".`,
    );
  }

  return issueIdentity(owner, repository, issue.number);
};
