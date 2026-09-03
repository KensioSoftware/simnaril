import { IdempotencyKeyReusedError } from "../idempotency-key-reused-error.js";
import type { HttpMiddleware } from "./operation.js";

/** Configures idempotent request replay. */
export interface ReplayIdempotentRequestsProps {
  /** The request header carrying the key. `Idempotency-Key` by default. */
  headerName?: string;
}

interface RequestFingerprint {
  body: Uint8Array | undefined;
  method: string;
  pathname: string;
  search: string;
}

interface AnsweredRequest {
  fingerprint: RequestFingerprint;
  response: Response;
}

const readBody = async (request: Request): Promise<Uint8Array | undefined> =>
  request.body === null
    ? undefined
    : new Uint8Array(await request.clone().arrayBuffer());

const bodyEquals = (
  first: Uint8Array | undefined,
  second: Uint8Array | undefined,
): boolean => {
  if (first === undefined || second === undefined) {
    return first === second;
  }

  if (first.byteLength !== second.byteLength) {
    return false;
  }

  return first.every((byte, index) => byte === second[index]);
};

const fingerprintRequest = async (
  request: Request,
): Promise<RequestFingerprint> => {
  const url = new URL(request.url);

  return {
    body: await readBody(request),
    method: request.method,
    pathname: url.pathname,
    search: url.search,
  };
};

const fingerprintEquals = (
  first: RequestFingerprint,
  second: RequestFingerprint,
): boolean =>
  first.method === second.method &&
  first.pathname === second.pathname &&
  first.search === second.search &&
  bodyEquals(first.body, second.body);

/** Replays the first completed response for each idempotency key. */
export function replayIdempotentRequests(
  props: ReplayIdempotentRequestsProps = {},
): HttpMiddleware {
  const headerName = props.headerName ?? "Idempotency-Key";
  const answered = new Map<string, AnsweredRequest>();

  return async ({ request }, next) => {
    const key = request.headers.get(headerName);

    if (key === null) {
      return next();
    }

    const fingerprint = await fingerprintRequest(request);
    const held = answered.get(key);

    if (held !== undefined) {
      if (!fingerprintEquals(held.fingerprint, fingerprint)) {
        throw new IdempotencyKeyReusedError(key, headerName);
      }

      return held.response.clone();
    }

    const response = await next();
    answered.set(key, { fingerprint, response: response.clone() });
    return response;
  };
}
