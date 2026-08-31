export interface GitHubRepository {
  full_name: string;
  html_url: string;
  id: number;
  name: string;
  owner: { login: string };
  private: boolean;
  url: string;
}

export interface GitHubIssue {
  body?: string;
  id: number;
  number: number;
  repository_url: string;
  state: "closed" | "open";
  title: string;
  updated_at: string;
  url: string;
}

export interface GitHubGist {
  description?: string;
  files: Record<string, { content: string }>;
  html_url: string;
  id: string;
  public: boolean;
  updated_at: string;
  url: string;
}

export interface GitHubRateLimit {
  id: "core";
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}
