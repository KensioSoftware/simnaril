# Getting started

Build a simulated API, add a widget to its state, and call it with `fetch()`.
The request runs inside Node.js and reads the state you created.

## Install Simnaril

Simnaril requires Node.js 24 or later. Install it as a development dependency
for tests and local development:

```sh
pnpm add -D @kensio/simnaril
```

## Create an API and resource

A `SimApi` represents one HTTP service. Call `api.resource()` to create a
collection of widgets and expose HTTP routes for it:

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

`widgets` holds the stored entities. It also handles requests such as
`GET /v1/widgets` and `PATCH /v1/widgets/:id`. Tests can read and change the
same entities through methods on `widgets`.

## Add test data

Call `seed()` with the complete entity you want in the simulation:

```ts
widgets.seed({
  id: "widget-1",
  name: "First widget",
  status: "active",
});
```

`seed()` stores this entity as supplied. It skips any creation function that
the simulated service would normally run to generate IDs or apply defaults.

## Connect application requests to the API

Register the API with a `SimEnvironment` using the origin your application
calls in production:

```ts
import { SimEnvironment } from "@kensio/simnaril";

using environment = new SimEnvironment();
environment.register("https://api.example.com", api);
```

An origin contains a scheme and host, plus a port if needed. Pass
`https://api.example.com`, without a request path, query string, or fragment.
The API's resource paths supply the rest of each URL.

The `using` declaration calls `environment.dispose()` when the current scope
ends. Until then, requests to this origin go to `api`. Requests to origins
outside every active simulation fail by default.

## Read and update the widget

The application uses an ordinary HTTP request:

```ts
const response = await fetch("https://api.example.com/v1/widgets/widget-1");

if (!response.ok) {
  throw new Error(`Unexpected response ${response.status}`);
}

const widget = (await response.json()) as Widget;
```

`SimEnvironment` passes the request to `api`. The API reads `widget-1` from
`widgets` and returns it as JSON in a `Response`.

An application function can update that same entity over HTTP:

```ts
async function archiveWidget(id: string): Promise<void> {
  const response = await fetch(`https://api.example.com/v1/widgets/${id}`, {
    body: JSON.stringify({ status: "archived" }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.status}`);
  }
}

await archiveWidget("widget-1");
console.log(widgets.get("widget-1").status); // "archived"
```

This `archiveWidget()` function is application code. It needs no reference to
the simulation. After the request completes, the state method `widgets.get()`
returns the updated entity.

## Reuse the definition across tests

Put the API definition in a factory function. Each call creates new resource
state and a new environment:

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

The returned object implements `Symbol.dispose`, which allows a test to use
`using sim` and release the registered origin when it finishes.

The following Vitest example uses `Widget` and `archiveWidget()` from above.
Create this simulation within the test, after disposing the walkthrough's
environment:

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

Tests share the factory function and create their own simulation objects. Only
one active environment can register a given origin in a Node.js process.
Dispose the environment before another test registers that origin.

## Next steps

[Resource state](../resource-state/README.md) explains the methods for arranging
and inspecting entities. [REST resources](../rest-resources/README.md) lists the
HTTP routes and their configuration.
