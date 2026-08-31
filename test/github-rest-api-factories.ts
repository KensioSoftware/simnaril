import { faker } from "@faker-js/faker";
import { DynamicFactory, MappedFactory } from "@kensio/part-factory";

import type {
  GitHubGist,
  GitHubIssue,
  GitHubRateLimit,
  GitHubRepository,
} from "./github-rest-api-types.js";

const githubOrigin = "https://api.github.com";

interface GitHubRepositoryParts {
  id: number;
  isPrivate: boolean;
  name: string;
  owner: string;
}

export const githubRepositoryFactory = new MappedFactory<
  GitHubRepositoryParts,
  GitHubRepository
>(
  () => ({
    id: faker.number.int({ min: 1, max: 2_000_000_000 }),
    isPrivate: faker.datatype.boolean(),
    name: faker.word.noun(),
    owner: faker.internet.username(),
  }),
  ({ id, isPrivate, name, owner }) => {
    const fullName = `${owner}/${name}`;
    return {
      full_name: fullName,
      html_url: `https://github.com/${fullName}`,
      id,
      name,
      owner: { login: owner },
      private: isPrivate,
      url: `${githubOrigin}/repos/${fullName}`,
    };
  },
);

interface GitHubIssueParts {
  body: string;
  id: number;
  number: number;
  owner: string;
  repositoryName: string;
  state: "closed" | "open";
  title: string;
  updatedAt: string;
}

export const githubIssueFactory = new MappedFactory<
  GitHubIssueParts,
  GitHubIssue
>(
  () => ({
    body: faker.lorem.paragraph(),
    id: faker.number.int({ min: 1, max: 2_000_000_000 }),
    number: faker.number.int({ min: 1, max: 100 }),
    owner: faker.internet.username(),
    repositoryName: faker.word.noun(),
    state: "open",
    title: faker.lorem.sentence(),
    updatedAt: faker.date.recent().toISOString(),
  }),
  ({ body, id, number, owner, repositoryName, state, title, updatedAt }) => {
    const repositoryUrl = `${githubOrigin}/repos/${owner}/${repositoryName}`;
    return {
      body,
      id,
      number,
      repository_url: repositoryUrl,
      state,
      title,
      updated_at: updatedAt,
      url: `${repositoryUrl}/issues/${number}`,
    };
  },
);

interface GitHubGistParts {
  description: string;
  files: Record<string, { content: string }>;
  id: string;
  isPublic: boolean;
  updatedAt: string;
}

export const githubGistFactory = new MappedFactory<GitHubGistParts, GitHubGist>(
  () => ({
    description: faker.lorem.sentence(),
    files: {
      [faker.system.fileName()]: { content: faker.lorem.paragraph() },
    },
    id: faker.string.hexadecimal({ length: 32, prefix: "" }),
    isPublic: faker.datatype.boolean(),
    updatedAt: faker.date.recent().toISOString(),
  }),
  ({ description, files, id, isPublic, updatedAt }) => ({
    description,
    files,
    html_url: `https://gist.github.com/${id}`,
    id,
    public: isPublic,
    updated_at: updatedAt,
    url: `${githubOrigin}/gists/${id}`,
  }),
);

export const githubRateLimitFactory = new DynamicFactory<GitHubRateLimit>(
  () => ({
    id: "core",
    limit: 5000,
    remaining: 5000,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 0,
  }),
);
