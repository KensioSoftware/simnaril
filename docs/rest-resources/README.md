# REST resources

`api.resource()` creates a collection of entities in memory and adds HTTP
routes to read and change them. The returned `RestResource` also exposes state
methods that tests can call directly.

## Create a resource

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

`path` is the collection path and must start with `/`. It can include named
parameters, but cannot contain a query string or fragment.

The resource provides these routes by default:

| Method   | Path           | Request body        | Success response              |
| -------- | -------------- | ------------------- | ----------------------------- |
| `GET`    | `/widgets`     | none                | `200` with a JSON array       |
| `POST`   | `/widgets`     | JSON partial entity | `201` with the created entity |
| `GET`    | `/widgets/:id` | none                | `200` with the entity         |
| `PATCH`  | `/widgets/:id` | JSON partial entity | `200` with the updated entity |
| `DELETE` | `/widgets/:id` | none                | `204` with no body            |

Each route calls the corresponding state method. The create route calls
`create()`, which runs the resource's creation function if one is configured.
Without a creation function, the caller must supply the complete entity.

Create and update requests are decoded as JSON by default. For form bodies or
another input format, see [Request bodies](../request-bodies/README.md).

## Arrange and inspect state in tests

Call state methods on the returned resource:

```ts
widgets.seed({ id: "widget-1", name: "First", status: "active" });

widgets.get("widget-1");
widgets.find("widget-1");
widgets.list();
widgets.update("widget-1", { status: "archived" });
widgets.delete("widget-1");
widgets.clear();
```

An entity seeded here is available to HTTP requests. An update made over HTTP
is visible through `get()`. [Resource state](../resource-state/README.md)
describes each method and its errors.

## Generate fields when an entity is created

Pass a `create` function alongside the resource's path:

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

A `POST /widgets` request can now omit `id`, `name`, and `status`. The creation
function fills those fields before the entity is stored. Direct calls to
`widgets.create()` run the same function. Calls to `widgets.seed()` skip it.

## Change a route's method or path

Configure a built-in operation under `operations`:

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

The update route is now `POST /widgets/:id/changes`. It still decodes JSON,
updates the stored entity, and returns that entity with status `200`.

Operation paths are appended to the collection path. The operation names are
`list`, `create`, `get`, `update`, and `delete`. With the default identity
lookup, paths for get, update, and delete must contain `:id`.

Use a [custom operation](../custom-operations/README.md) when the operation's
behavior needs to change too.

## Disable routes the service does not support

Set an operation to `false` to omit its route:

```ts
const widgets = api.resource<Widget>({
  path: "/widgets",
  operations: {
    create: false,
    update: false,
    delete: false,
  },
});
```

This resource has only list and get routes. Requests to the omitted create,
update, or delete routes throw `UnimplementedRouteError`.

## Use parent resources and composite identities

A collection path can contain parameters such as a repository's owner and
name. `itemPath` supplies the path appended for get, update, and delete:

```ts
import { requirePathParameter } from "@kensio/simnaril";

interface Issue {
  number: number;
  owner: string;
  repository: string;
  title: string;
}

const issues = api.resource<Issue>({
  path: "/repos/:owner/:repository/issues",
  itemPath: "/:number",
  identify: (issue) => `${issue.owner}/${issue.repository}#${issue.number}`,
  locate: (params) =>
    `${requirePathParameter(params, "owner")}/${requirePathParameter(
      params,
      "repository",
    )}#${requirePathParameter(params, "number")}`,
});
```

This creates routes such as
`GET /repos/kensio/simnaril/issues/42`. The state identity for that issue is
`kensio/simnaril#42`.

`identify` converts a stored entity into its state key. `locate` converts
request path parameters into the same key. The default `locate` reads
`params.id`, so provide a locator when your route uses another parameter or
combines several parameters.

`requirePathParameter()` returns a decoded parameter value. It throws an
error if the named parameter is absent.

The locator applies to get, update, and delete. The default list operation
still returns every entity in the resource, and create uses only the request
body. Override those operations to filter by parent or copy parent parameters
into a new entity. Their handlers receive the same `params` object.

## Understand HTTP errors

Errors thrown during a matched operation or its middleware can become HTTP
responses. Simnaril includes these mappings:

| Error                       | Status |
| --------------------------- | ------ |
| `EntityNotFoundError`       | `404`  |
| `DuplicateEntityError`      | `409`  |
| `IdempotencyKeyReusedError` | `422`  |

The last mapping applies when you use the
[idempotency middleware](../idempotent-requests/README.md). Each default error
response is JSON with an `error` property containing the error message:

```json
{
  "error": "No widget exists with identity \"missing\"."
}
```

A request for a missing entity on a registered route returns a simulated
`404`. A method or path with no registered route throws
`UnimplementedRouteError`. Implement that route if the application is
expected to call it.

Node's `fetch()` wraps an `UnimplementedRouteError` in a `TypeError`. Read
`error.cause` for the original error.

Give an API a name to identify it in route errors:

```ts
const api = new SimApi({ name: "GitHub" });
```

An unmatched request now reports that it reached `GitHub`. The default name is
`SimApi`.

## Customize error responses

Set `formatError` on the API when the service uses a particular error body or
status:

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

This formatter changes the response for a missing entity to the nested
`error` object shown in the example. It applies across the API's matched
operations and middleware.

The formatter runs before the default mappings. Return a `Response` to handle
an error, or `undefined` to use the defaults. An error that neither the
formatter nor a default mapping handles is thrown to the caller.

Unmatched routes throw before this formatting step. A formatter cannot turn
an unimplemented route into an HTTP error response.
