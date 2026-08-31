# Simnaril

In-process third-party API simulator

## Run an application against a simulated service

A simulation is an object with domain state and an HTTP handler. Register it
under the service's production origin, then call the application without
changing its base URL.

```ts
import { SimEnvironment, SimResource, type SimService } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
}

class SimWidgets implements SimService {
  readonly widgets = new SimResource<Widget>({ name: "widget" });

  handle(request: Request): Response {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/v1/widgets") {
      return Response.json(this.widgets.list());
    }

    return new Response("Not found", { status: 404 });
  }
}

const service = new SimWidgets();
service.widgets.seed({ id: "widget-1", name: "First widget" });

using sim = new SimEnvironment();
sim.register("https://api.example.com", service);

const response = await fetch("https://api.example.com/v1/widgets");
const result = await response.json();
```

`SimEnvironment` routes every path at the registered origin to the same
service. Leaving the `using` scope stops interception for that environment.
An origin has one owner while its environment is active. A second registration
throws, and disposal releases the origin.

## Model resource state

`SimResource<T>` owns the in-memory state for one entity type. Entities use
their `id` property as the identity unless the resource supplies an `identify`
function. The conventional identity is a string-valued `id`. An `identify`
function can select another state key.

`seed()` stores an exact entity for test arrangement. `create()` runs the
resource's creation behaviour before storing the result.

```ts
const widgets = new SimResource<Widget>({
  create: (input) => ({
    id: crypto.randomUUID(),
    name: input.name ?? "Untitled widget",
  }),
});

widgets.seed({ id: "widget-1", name: "First widget" });
const created = widgets.create({ name: "Second widget" });

widgets.get(created.id);
widgets.find("missing"); // undefined
widgets.update(created.id, { name: "Renamed widget" });
widgets.delete(created.id);
widgets.clear();
```

`get()` throws `EntityNotFoundError` when the identity is absent. `seed()` and
`create()` throw `DuplicateEntityError` when the identity already exists.

## Design decisions

- [HTTP interception](docs/decisions/http-interception.md)
