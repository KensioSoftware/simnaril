# Idempotent requests

`replayIdempotentRequests()` remembers the first completed response for each
idempotency key. A later request with the same key receives a copy of that
response, including its status, status text, body, and headers.

This behavior follows the request fingerprint and replay model in the
[IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07).

Add it as API middleware:

```ts
import { replayIdempotentRequests, SimApi } from "@kensio/simnaril";

const api = new SimApi();

api.use(replayIdempotentRequests());
```

The middleware reads `Idempotency-Key` by default. Set `headerName` for a
service that uses another header:

```ts
api.use(
  replayIdempotentRequests({
    headerName: "PayPal-Request-Id",
  }),
);
```

Requests without the configured header pass through unchanged. Simnaril does
not require an idempotency key and does not replay requests unless this
middleware is configured.

## Request comparison

A repeated key must carry the same:

- HTTP method
- encoded URL pathname
- serialized query string, including parameter order and encoding
- raw request body bytes

The request origin and other headers do not take part in the comparison. JSON
whitespace and property order matter because the middleware compares the raw
body before an operation decodes it.

A different request throws `IdempotencyKeyReusedError`. The supplied error
mapping answers with status `422` and an `{ error }` JSON body. An API error
formatter can replace that response with the service's own error envelope:

```ts
import {
  IdempotencyKeyReusedError,
  type ErrorFormatter,
} from "@kensio/simnaril";

const stripeErrorFormat: ErrorFormatter = (error) =>
  error instanceof IdempotencyKeyReusedError
    ? Response.json(
        {
          error: {
            message: error.message,
            type: "idempotency_error",
          },
        },
        { status: 400 },
      )
    : undefined;
```

The middleware keeps responses for its lifetime. It has no expiry, eviction,
retry, or concurrent in-flight request handling.
