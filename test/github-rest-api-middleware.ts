import { createHash } from "node:crypto";

import type { HttpMiddleware, SimResource } from "../src/index.js";
import type { GitHubRateLimit } from "./github-rest-api-types.js";

const positiveInteger = (value: string | null, fallback: number): number => {
  if (value === null || !/^\d+$/u.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return parsed > 0 ? parsed : fallback;
};

const paginationLink = (
  request: Request,
  page: number,
  perPage: number,
  relation: string,
): string => {
  const url = new URL(request.url);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  return `<${url.href}>; rel="${relation}"`;
};

export const paginate: HttpMiddleware = async ({ query, request }, next) => {
  const response = await next();

  if (!response.ok) {
    return response;
  }

  const entities = (await response.json()) as unknown[];
  const perPage = Math.min(positiveInteger(query.get("per_page"), 30), 100);
  const page = positiveInteger(query.get("page"), 1);
  const lastPage = Math.max(Math.ceil(entities.length / perPage), 1);
  const links: string[] = [];

  if (page < lastPage) {
    links.push(
      paginationLink(request, page + 1, perPage, "next"),
      paginationLink(request, lastPage, perPage, "last"),
    );
  }

  if (page > 1) {
    links.push(
      paginationLink(request, 1, perPage, "first"),
      paginationLink(request, Math.min(page - 1, lastPage), perPage, "prev"),
    );
  }

  const headers = new Headers(response.headers);

  if (links.length > 0) {
    headers.set("link", links.join(", "));
  }

  const start = (page - 1) * perPage;
  return Response.json(entities.slice(start, start + perPage), {
    headers,
    status: response.status,
  });
};

export const conditionallyCache: HttpMiddleware = async ({ request }, next) => {
  const response = await next();

  if (!response.ok) {
    return response;
  }

  const body = await response.text();
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const headers = new Headers(response.headers);
  headers.set("etag", etag);

  if (request.headers.get("if-none-match") === etag) {
    return new Response(undefined, { headers, status: 304 });
  }

  return new Response(body, { headers, status: response.status });
};

export const addRateLimitHeaders =
  (rateLimits: SimResource<GitHubRateLimit>): HttpMiddleware =>
  async (_context, next) => {
    const current = rateLimits.get("core");
    const used = current.used + 1;
    const updated = rateLimits.update("core", {
      remaining: Math.max(current.limit - used, 0),
      used,
    });
    const response = await next();
    response.headers.set("x-ratelimit-limit", String(updated.limit));
    response.headers.set("x-ratelimit-remaining", String(updated.remaining));
    response.headers.set("x-ratelimit-reset", String(updated.reset));
    response.headers.set("x-ratelimit-resource", updated.id);
    response.headers.set("x-ratelimit-used", String(updated.used));
    return response;
  };
