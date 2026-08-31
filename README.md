# Simnaril

In-process third-party API simulator

## Run an application against a simulated service

A `SimApi` holds resource state and handles HTTP requests for one simulated
service. Register it under the service's production origin, then call the
application without changing its base URL.

```ts
import { SimApi, SimEnvironment } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
}

const api = new SimApi();
const widgets = api.resource<Widget>({ path: "/v1/widgets" });
widgets.seed({ id: "widget-1", name: "First widget" });

using sim = new SimEnvironment();
sim.register("https://api.example.com", api);

const response = await fetch("https://api.example.com/v1/widgets");
const result = await response.json();
```

`SimEnvironment` routes every path at the registered origin to the same
service. Leaving the `using` scope stops interception for that environment.
An origin has one owner while its environment is active. A second registration
throws, and disposal releases the origin.

## Expose resource CRUD over HTTP

`api.resource<T>({ path })` creates a `SimResource<T>` and exposes it through a
`RestResource<T>`. The returned resource delegates the state methods, so tests
can call `widgets.seed()`, `widgets.get()` and the other state operations
directly.

Entities use a string `id` as their conventional identity. The HTTP defaults
are:

| Method   | Path           | Request body        | Success response              |
| -------- | -------------- | ------------------- | ----------------------------- |
| `GET`    | `/widgets`     | none                | `200` with a JSON array       |
| `POST`   | `/widgets`     | JSON entity input   | `201` with the created entity |
| `GET`    | `/widgets/:id` | none                | `200` with the entity         |
| `PATCH`  | `/widgets/:id` | JSON partial entity | `200` with the updated entity |
| `DELETE` | `/widgets/:id` | none                | `204` with no body            |

The default `SimResource.create()` stores the supplied entity. Pass a `create`
function when the simulated service generates identifiers or other fields.

Missing entities return `404`. Duplicate identities return `409`. Both errors
have a JSON body with one `error` property containing the domain error message.
An unknown method or path throws `UnimplementedRouteError`. This loud failure
keeps an unfinished simulation distinct from a simulated service returning a
legitimate 404.

`SimApi.handle(Request)` is the HTTP entry point. `SimEnvironment` calls that
method for intercepted requests. Request decoding, the semantic resource
operation and response encoding run as separate pipeline steps. JSON is the
default request and response codec.

## Share state between API representations

One `SimResource` can back more than one API or version. Each `RestResource`
delegates to the same state object.

```ts
import { SimApi, SimResource } from "@kensio/simnaril";

const state = new SimResource<Widget>({});

const apiV1 = new SimApi();
const apiV2 = new SimApi();

const v1 = apiV1.expose(state, { path: "/v1/widgets" });
const v2 = apiV2.expose(state, { path: "/v2/things" });

v1.seed({ id: "widget-1", name: "First widget" });
v2.get("widget-1");
```

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
