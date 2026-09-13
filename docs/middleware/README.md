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

## Reject a request before it reaches the operation

Return a response directly to stop the request:

```ts
const requireAuthorization: HttpMiddleware = ({ request }, next) => {
  if (request.headers.get("authorization") !== "Bearer test-token") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return next();
};
```

With `widgets.use(requireAuthorization)`, a request with the wrong token
receives `401`, and the resource operation does not run.

For a simulation whose tokens can be revoked, keep token state in an explicit
object and let the middleware read it. Tests can change that state to cause
authorization failures.

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

## Register idempotency middleware first

When using `replayIdempotentRequests()`, register it before API middleware
that reads the request body. The replay middleware clones the request, which
fails if an earlier middleware has already consumed the body.

Register it before API middleware that changes responses too. It can then
store the final response after the later middleware has finished. See
[Idempotent requests](../idempotent-requests/README.md) for the replay behavior
and its limits.
