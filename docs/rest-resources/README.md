# REST resources

`api.resource()` creates in-memory state and exposes conventional JSON CRUD
operations for it.

## Create a REST resource

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
  path: "/widgets",
});
```

The resource path is an absolute collection path. It cannot contain path
parameters, a query string, or a fragment.

The supplied routes are:

| Method   | Path           | Request body        | Success response              |
| -------- | -------------- | ------------------- | ----------------------------- |
| `GET`    | `/widgets`     | none                | `200` with a JSON array       |
| `POST`   | `/widgets`     | JSON partial entity | `201` with the created entity |
| `GET`    | `/widgets/:id` | none                | `200` with the entity         |
| `PATCH`  | `/widgets/:id` | JSON partial entity | `200` with the updated entity |
| `DELETE` | `/widgets/:id` | none                | `204` with no body            |

The `list`, `get`, `update`, and `delete` operations call the corresponding
state method. The `create` operation calls the resource's configured creation
behavior.

JSON is the default for request bodies. [Request bodies](../request-bodies/README.md) covers
supplying a decoder for a service that takes another format.

## Use the state API from tests

The returned `RestResource` delegates every state method:

```ts
widgets.seed({ id: "widget-1", name: "First", status: "active" });

widgets.get("widget-1");
widgets.find("widget-1");
widgets.list();
widgets.update("widget-1", { status: "archived" });
widgets.delete("widget-1");
widgets.clear();
```

The same state backs direct method calls and HTTP requests. A change through
one interface is visible through the other.

## Configure creation

Pass state options to `api.resource()` along with the HTTP path:

```ts
const widgets = api.resource<Widget>({
  name: "widget",
  path: "/widgets",
  create(input) {
    return {
      id: crypto.randomUUID(),
      name: input.name ?? "Untitled widget",
      status: "active",
    };
  },
});
```

A `POST /widgets` request can now omit the generated and defaulted fields.

## Understand HTTP errors

Simnaril translates state errors for supplied and semantic operations:

- `EntityNotFoundError` becomes `404`.
- `DuplicateEntityError` becomes `409`.

The response body contains an `error` property with the domain error message:

```json
{
  "error": "No widget exists with identity \"missing\"."
}
```

An unmatched method or path throws `UnimplementedRouteError`. A missing entity
on a known route returns a normal simulated `404`. This distinction makes an
unfinished simulation visible during development.

Node's `fetch()` wraps an `UnimplementedRouteError` in a `TypeError`. The
original error is available as `error.cause`.

## Shape the errors one API answers with

A real service has one error envelope across every endpoint. Stripe's is
`{ error: { type, code, message, param } }` and GitHub's is
`{ message, documentation_url }`. Describe the shape once, on the API.

```ts
import { EntityNotFoundError, SimApi } from "@kensio/simnaril";

const api = new SimApi({
  formatError: (error) => {
    if (error instanceof EntityNotFoundError) {
      return Response.json(
        { error: { message: error.message, type: "invalid_request_error" } },
        { status: 404 },
      );
    }

    return undefined;
  },
});
```

The formatter runs before the two supplied mappings, so it shapes
`EntityNotFoundError` and `DuplicateEntityError` as well as anything the
simulation raises on its own behalf. Return `undefined` to decline an error and
leave it to them.

An error nothing shapes still escapes as a thrown error, the way it does today.
A simulation that has not been taught about a failure says so, in place of
answering `500` and hiding it.

## Move a supplied route

Configure the method, resource-relative path, or both under `operations`:

```ts
const widgets = api.resource<Widget>({
  path: "/widgets",
  operations: {
    update: {
      method: "POST",
      path: "/:id/changes",
    },
  },
});
```

This changes the update route to `POST /widgets/:id/changes`. Its JSON decoding,
state behavior, error translation, status, and response encoding remain the
same.

The supplied operation names are `list`, `create`, `get`, `update`, and
`delete`. Configured paths for `get`, `update`, and `delete` must include an
`:id` parameter because their default handlers use it as the state identity.

Read [Custom operations](../custom-operations/README.md) when a route needs
different behavior.
