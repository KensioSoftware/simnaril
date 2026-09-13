# Middleware

Middleware is a function that runs around an HTTP operation. It can inspect
the request, return a response early, or change the operation's response.
Use it for behavior shared by several routes, such as authentication or
response headers.

## Write a middleware function

A middleware function receives request context and a `next()` function:

```ts
import type { HttpMiddleware } from "@kensio/simnaril";

const addRequestId: HttpMiddleware = async ({ request }, next) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = await next();
  response.headers.set("x-request-id", requestId);
  return response;
};
```

This middleware reads or generates a request ID, awaits the operation, then
adds the ID to the response headers.

The context contains `request`, the original `Request`, `params`, the decoded
path parameters, and `query`, a `URLSearchParams` object.

Call `next()` to continue to the next middleware or operation. You can call
it once. A second call throws an error. To reject a request before the
operation runs, return a `Response` without calling `next()`.

## Choose which operations use it

Call `use()` on the API to run middleware for every matched operation:

```ts
api.use(addRequestId);
```

Call it on a resource to cover that resource's built-in and custom operations:

```ts
widgets.use(addRequestId);
```

Call it on an individual operation to cover only that route:

```ts
widgets.operations.create.use(addRequestId);
```

These examples show alternative scopes for `addRequestId`. Use the scope that
matches the service's behavior. `api` and `widgets` are the objects created in
[Getting started](../getting-started/README.md).

The operation objects returned by `widgets.operation()` and `api.operation()`
also have `use()` methods. See
[Custom operations](../custom-operations/README.md) for examples.

## Understand execution order

After a route matches, middleware runs in this order:

```text
API middleware
  -> resource middleware
    -> operation middleware
      -> operation
```

Within each scope, middleware enters in registration order. Code after
`await next()` runs in reverse order as the response returns. For example,
API middleware can add a header after resource middleware has changed the
response body.

Raw API operations have API and operation middleware. They have no resource
middleware. A request with no matching route throws before middleware runs.

## Require a bearer token

Use `requireBearerToken()` to check the `Authorization` header before an
operation runs:

```ts
import { requireBearerToken } from "@kensio/simnaril";

api.use(requireBearerToken({ token: "test-token" }));
```

The expected token belongs to this middleware instance. Different APIs can
require different tokens. You can also register it on a resource or an
individual operation with `use()`.

The middleware accepts the `Bearer` scheme in any letter case and compares
the token exactly (including case). It follows the bearer credential grammar
in [RFC 6750, section 2.1](https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1).
The separator is one or more ASCII spaces. Tokens contain ASCII letters,
digits, `-`, `.`, `_`, `~`, `+`, or `/`, with optional `=` padding at the end.
Empty tokens, tabs between the scheme and token, embedded whitespace,
quoted tokens, and combined credentials are refused.

`Request` and `Headers` remove surrounding HTTP whitespace before middleware
runs. A header constructed as `"Bearer test-token "` reaches the middleware as
`"Bearer test-token"`. This follows
[HTTP field-value parsing](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.5).
The middleware validates the normalized value it receives.

Missing, malformed, or mismatched credentials produce `BearerTokenError`
with a `reason` of `"missing"`, `"malformed"`, or `"mismatch"`. The default
response has status `401`, a `WWW-Authenticate: Bearer` header, and a JSON
`{ error }` body. Error messages omit both the supplied and expected tokens.
The operation stays unexecuted, and its request body stays unread.

Pass `formatError` to shape the refusal for your simulated service:

```ts
import { BearerTokenError, type ErrorFormatter } from "@kensio/simnaril";

const googleError: ErrorFormatter = (error) =>
  error instanceof BearerTokenError
    ? Response.json(
        {
          error: {
            code: 401,
            message: error.message,
            status: "UNAUTHENTICATED",
          },
        },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      )
    : undefined;

api.use(requireBearerToken({ token: "test-token", formatError: googleError }));
```

This example replaces the earlier `api.use()` call. The formatter controls
the complete response. Returning `undefined` leaves the error to the API's
`formatError` callback, then Simnaril's default mapping. You can configure
only the API formatter when every operation shares the same error envelope.

This middleware checks one fixed token. Token issuance, expiry, scopes and
OAuth flows belong to the simulated service. For revocation or rotating
tokens, write middleware that reads an explicit object holding token state.

## Change the response

Await `next()` before modifying the operation's response:

```ts
const addApiVersion: HttpMiddleware = async (_context, next) => {
  const response = await next();
  response.headers.set("x-api-version", "2026-08-31");
  return response;
};
```

To change a response body, return a new `Response`. This example wraps the
list operation's JSON array in a `data` property:

```ts
const wrapCollection: HttpMiddleware = async (_context, next) => {
  const response = await next();

  if (!response.ok) {
    return response;
  }

  const data = (await response.json()) as unknown[];
  return Response.json({ data }, { status: response.status });
};

widgets.operations.list.use(wrapCollection);
```

The example leaves unsuccessful responses unchanged. Its new response copies
the status. Copy any other headers your simulated service needs when you
replace a response.

## Order authentication and idempotency middleware

Register authentication before `replayIdempotentRequests()` to check every
request, including retries that receive a stored response:

```ts
import { replayIdempotentRequests } from "@kensio/simnaril";

api.use(requireBearerToken({ token: "test-token" }));
api.use(replayIdempotentRequests());
```

Use this order when constructing the API. Replay can answer without running
later middleware, so authentication registered after replay would be skipped
for a stored response.

Register `replayIdempotentRequests()` before API middleware
that reads the request body. The replay middleware clones the request, which
fails if an earlier middleware has already consumed the body.

Register it before API middleware that changes responses too. It can then
store the final response after the later middleware has finished. See
[Idempotent requests](../idempotent-requests/README.md) for the replay behavior
and its limits.
