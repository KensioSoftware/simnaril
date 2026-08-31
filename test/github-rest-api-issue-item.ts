import type { RestResource } from "../src/index.js";
import {
  issueIdentity,
  pathParameter,
} from "./github-rest-api-issue-identity.js";
import { conditionallyCache } from "./github-rest-api-middleware.js";
import type { GitHubIssue } from "./github-rest-api-types.js";

export const configureIssueItem = (issues: RestResource<GitHubIssue>): void => {
  issues.operations.get.override({
    handle({ params, resource }) {
      const owner = pathParameter(params, "owner");
      const repository = pathParameter(params, "repository");
      const number = Number(pathParameter(params, "id"));
      return resource.get(issueIdentity(owner, repository, number));
    },
  });
  issues.operations.get.use(conditionallyCache);

  issues.operations.update.override({
    handle({ input, params, resource }) {
      const identity = issueIdentity(
        pathParameter(params, "owner"),
        pathParameter(params, "repository"),
        Number(pathParameter(params, "id")),
      );
      return resource.update(identity, {
        ...input,
        updated_at: new Date().toISOString(),
      });
    },
  });
};
