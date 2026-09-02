import type { RestResource } from "../src/index.js";
import { conditionallyCache } from "./github-rest-api-middleware.js";
import type { GitHubIssue } from "./github-rest-api-types.js";

export const configureIssueItem = (issues: RestResource<GitHubIssue>): void => {
  issues.operations.get.use(conditionallyCache);

  issues.operations.update.override({
    handle({ input, params, resource }) {
      return resource.update(resource.locate(params), {
        ...input,
        updated_at: new Date().toISOString(),
      });
    },
  });
};
