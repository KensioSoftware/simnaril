# Middleware

Middleware runs around a matched HTTP operation. It can inspect the request,
change shared context, stop the operation, or change the response.

## Write middleware

A middleware function receives the parsed HTTP context and a `next` function:

```ts
import type { HttpMiddleware } from "@kensio/simnaril";

const addRequestId: HttpMiddleware = async ({ request }, next) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = await next();
  response.headers.set("x-request-id", requestId);
  return response;
};
```

The context contains:

- `request`, the original `Request`
- `params`, the decoded path parameters
- `query`, the request's `URLSearchParams`

Call `next()` once to run the next middleware or operation. Calling it more
than once throws an error.

## Choose a scope

Add API middleware to every matched operation in one `SimApi`:

```ts
api.use(addRequestId);
```

Add resource middleware to all supplied and custom operations on one resource:

```ts
widgets.use(requireAuthorization);
```

Add operation middleware to one supplied, resource, or raw operation:

```ts
widgets.operations.create.use(recordCreation);
archive.use(recordArchive);
report.use(addReportHeaders);
```

## Understand the order

Requests enter middleware in this order:

```text
API middleware
  -> resource middleware
    -> operation middleware
      -> operation
```

Responses return through operation, resource, and API middleware in reverse
order. Raw operations have API and operation middleware because they do not
belong to a resource.

Middleware at the same scope runs in registration order on the way in and
reverse registration order on the way out.

## Return a response early

A middleware function can skip `next()` and return its own response. This is
useful for authentication, rate limits, and service availability:

```ts
const requireAuthorization: HttpMiddleware = ({ request }, next) => {
  if (request.headers.get("authorization") !== "Bearer test-token") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return next();
};
```

## Change a response

Call `next()` first when the middleware needs the operation's response:

```ts
const addApiVersion: HttpMiddleware = async (_context, next) => {
  const response = await next();
  response.headers.set("x-api-version", "2026-08-31");
  return response;
};
```

A middleware function may return a new `Response`. This supports response body
changes such as pagination or conditional requests:

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

Middleware is part of the simulated service. Keep state such as rate-limit
usage in a `SimResource` or another explicit object, then pass that object to a
middleware factory.
