# Getting started

This guide builds a small simulation and runs ordinary application code against
it.

## Install Simnaril

Install the package with your package manager:

```sh
pnpm add -D @kensio/simnaril
```

Simnaril requires Node.js 24 or later. It is usually a development dependency
because the simulation runs in tests and local development.

## Define a resource

A `SimApi` represents one HTTP service. Its resources hold the simulated
service's state and expose that state over HTTP.

```ts
import { SimApi } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
  status: "active" | "archived";
}

const api = new SimApi();
const widgets = api.resource<Widget>({
  name: "widget",
  path: "/v1/widgets",
});
```

The returned `widgets` object has two roles. It provides direct methods for
changing and inspecting state, and it exposes the usual JSON CRUD routes below
`/v1/widgets`.

## Arrange the simulated state

Use `seed()` to put an exact entity into the simulation:

```ts
widgets.seed({
  id: "widget-1",
  name: "First widget",
  status: "active",
});
```

`seed()` is intended for test arrangement. It preserves the entity you pass to
it without applying service creation behavior.

## Register the API

A `SimEnvironment` intercepts HTTP requests. Register the API under the same
origin that the application uses in production:

```ts
import { SimEnvironment } from "@kensio/simnaril";

using environment = new SimEnvironment();
environment.register("https://api.example.com", api);
```

Registration takes an origin such as `https://api.example.com`. Do not include
a path, query string, or fragment.

The `using` declaration disposes the environment when the current scope ends.
Disposal removes its interception and releases its registered origins.

## Run the application

The application continues to use its normal URL and HTTP client:

```ts
const response = await fetch("https://api.example.com/v1/widgets/widget-1");

if (!response.ok) {
  throw new Error(`Unexpected response ${response.status}`);
}

const widget = (await response.json()) as Widget;
```

The request stays in the Node.js process. `SimEnvironment` sends it to the
registered `SimApi`, which reads the entity from `widgets` and returns a normal
`Response`.

Changes made through HTTP remain in the resource state:

```ts
await fetch("https://api.example.com/v1/widgets/widget-1", {
  body: JSON.stringify({ status: "archived" }),
  headers: { "content-type": "application/json" },
  method: "PATCH",
});

console.log(widgets.get("widget-1").status); // "archived"
```

## Use a fresh simulation in each test

Put the definition in a function when several tests use the same simulated
service:

```ts
function createWidgetSim() {
  const environment = new SimEnvironment();
  const api = new SimApi();
  const widgets = api.resource<Widget>({ path: "/v1/widgets" });

  environment.register("https://api.example.com", api);

  return {
    environment,
    widgets,
    [Symbol.dispose]() {
      environment.dispose();
    },
  };
}
```

Each call creates separate state:

```ts
import { expect, test } from "vitest";

test("archives a widget", async () => {
  using sim = createWidgetSim();
  sim.widgets.seed({
    id: "widget-1",
    name: "First widget",
    status: "active",
  });

  await archiveWidget("widget-1");

  expect(sim.widgets.get("widget-1").status).toBe("archived");
});
```

Create the simulation before calling the application and dispose it after the
application finishes. This keeps state and HTTP interception within the test's
lifetime.

## Continue reading

Read [Resource state](../resource-state/README.md) for direct state operations
and [REST resources](../rest-resources/README.md) for the supplied HTTP routes.
