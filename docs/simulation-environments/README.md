# Simulation environments

`SimEnvironment` connects production-style HTTP requests to simulated services.
It owns HTTP interception and the origins registered within it.

## Register a service

Every registered service implements one method:

```ts
interface SimService {
  handle(request: Request): Promise<Response> | Response;
}
```

`SimApi` implements this interface. You can also register a small hand-written
service when the API and resource model does not suit an endpoint:

```ts
import { SimEnvironment, type SimService } from "@kensio/simnaril";

const healthService: SimService = {
  handle(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ready" });
    }

    return new Response("Not found", { status: 404 });
  },
};

using environment = new SimEnvironment();
environment.register("https://status.example.com", healthService);
```

One service handles every path at its registered origin. The service receives a
Web Platform `Request` and returns a `Response`.

## Handle requests outside the simulation

An environment rejects requests to unregistered origins by default. This
prevents a test from reaching a network service by accident.

Node's `fetch()` wraps the Simnaril error in a network error. Inspect `cause` to
read the original `UnclaimedOriginError`:

```ts
import { UnclaimedOriginError } from "@kensio/simnaril";

try {
  await fetch("https://unregistered.example.com/data");
} catch (error) {
  if (
    error instanceof TypeError &&
    error.cause instanceof UnclaimedOriginError
  ) {
    console.error(error.cause.method);
    console.error(error.cause.origin);
    console.error(error.cause.url);
  }
}
```

Set `unhandledRequest` to `"passthrough"` when the process must also reach real
network services:

```ts
using environment = new SimEnvironment({
  unhandledRequest: "passthrough",
});
```

Registered origins remain simulated. Requests to other origins pass through to
the network.

## Dispose the environment

Dispose the environment as soon as the application has finished using it:

```ts
const environment = new SimEnvironment();

try {
  environment.register("https://api.example.com", api);
  await runApplication();
} finally {
  environment.dispose();
}
```

`dispose()` is safe to call more than once. A disposed environment cannot accept
new registrations.

Only one active environment can own an origin. A second registration for the
same origin throws an error. Disposal releases the origin for another
environment.

Set the optional `name` property to identify the environment in registration
and disposal errors when a process has several environments.

Different active environments can own different origins. Their registered
services and state stay separate.

## Call a service without interception

Call `SimApi.handle()` directly when a test only needs the HTTP behavior of one
API:

```ts
const response = await api.handle(
  new Request("https://api.example.com/v1/widgets"),
);
```

Direct handling avoids process-wide HTTP interception. It still runs routing,
request decoding, middleware, state operations, error translation, and response
encoding.
