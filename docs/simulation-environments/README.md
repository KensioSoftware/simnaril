# Simulation environments

`SimEnvironment` intercepts outgoing HTTP requests and sends them to registered
simulated services. Application code keeps using its normal URLs and HTTP client.

## Register a service

Register each service under its HTTP origin, such as
`https://api.example.com`. The origin can include a port, but must have no
request path, query string, or fragment.

A service implements one method:

```ts
interface SimService {
  handle(request: Request): Promise<Response> | Response;
}
```

`SimApi` implements this interface. You can also write a service directly when
you only need a small handler:

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

Every request to `https://status.example.com` reaches `healthService`. This
handler answers `GET /health` with JSON and returns `404` for all other paths
and methods. The handler controls that behavior.

An environment can register several services under different origins.
Separate active environments can also register different origins, but a second
registration of the same origin throws an error. Disposing an environment
releases its origins.

Set the environment's optional `name` to identify it in registration and
disposal errors when several simulations run in one process.

## Control requests to other origins

By default, a request fails if its origin belongs to no active simulation.
With Node's `fetch()`, the failure is a `TypeError` whose `cause` is an
`UnclaimedOriginError`:

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

Set `unhandledRequest` to `"passthrough"` when your application also needs to
call real services:

```ts
using environment = new SimEnvironment({
  unhandledRequest: "passthrough",
});
```

This environment still handles its registered origins. It allows other
requests to reach another active simulation or the real network. If another
active environment uses the default error policy, that environment can still
block a request to an unregistered origin.

## Dispose an environment

Use a `using` declaration to keep interception active for the current scope:

```ts
using environment = new SimEnvironment();
environment.register("https://api.example.com", api);
await runApplication();
```

Here, `api` is your simulated API and `runApplication()` is the application
work that makes HTTP requests. Await that work before leaving the scope.

If explicit cleanup fits your code better, call `dispose()` in `finally`:

```ts
const environment = new SimEnvironment();

try {
  environment.register("https://api.example.com", api);
  await runApplication();
} finally {
  environment.dispose();
}
```

`dispose()` stops this environment's interception and releases its origins.
Calling it again has no effect. A disposed environment cannot register more
services.

## Handle a request directly

Call `SimApi.handle()` when you want to exercise an API without installing
HTTP interception:

```ts
const response = await api.handle(
  new Request("https://api.example.com/v1/widgets"),
);
```

The call runs the API's routing and middleware, decodes the request, runs the
operation, and produces the response. It uses the same resource state as an
intercepted request.

The URL supplies the path and query string for routing. A direct call to
`api.handle()` needs no origin registration.
