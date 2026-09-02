# Custom operations

Simnaril provides three ways to go beyond the supplied REST behavior. Choose
the smallest change that matches the service.

## Override a supplied operation

Use `override()` when the route and response format are suitable but the
resource behavior differs.

```ts
widgets.operations.create.override({
  handle({ input, query, request, resource }) {
    const prefix = query.get("prefix") ?? "widget";

    return resource.create({
      ...input,
      id: request.headers.get("x-widget-id") ?? crypto.randomUUID(),
      name: input.name ?? `${prefix} without a name`,
      status: "active",
    });
  },
});
```

The handler receives decoded `input`, the `resource`, the original `request`,
path `params`, and parsed `query` parameters.

The supplied HTTP pipeline remains active. For the create operation, Simnaril
still decodes JSON, translates resource errors, returns status `201`, and
encodes the result as JSON.

## Add a resource operation

Use `resource.operation()` for an action that belongs to a resource, such as
archiving a widget:

```ts
import { requirePathParameter } from "@kensio/simnaril";

const archive = widgets.operation<{ reason: string }, Widget>("archive", {
  method: "POST",
  path: "/:id/archive",
  handle({ input, params, resource }) {
    const id = requirePathParameter(params, "id");
    console.log(input.reason);
    return resource.update(id, { status: "archived" });
  },
});
```

The path is relative to the resource collection, so this example handles
`POST /widgets/:id/archive`.

When a request has a body, Simnaril decodes it as JSON and passes it as `input`.
A returned value becomes a JSON response with status `200`. Returning
`undefined` produces status `204` with no body.

The method returns a semantic operation object. Use it to attach middleware to
that operation:

```ts
archive.use(recordArchiveRequest);
```

## Add a raw HTTP operation

Use `api.operation()` when the handler needs direct control of the response:

```ts
const report = api.operation(
  "GET",
  "/reports/:reportId",
  ({ params, query, request }) => {
    return Response.json(
      {
        method: request.method,
        reportId: params["reportId"],
        view: query.get("view"),
      },
      { status: 202 },
    );
  },
);
```

Raw operation paths are absolute API paths. Simnaril matches the method and
path, decodes named path parameters, and supplies the parsed query string. The
handler builds the complete `Response`.

Raw operations can also use operation middleware:

```ts
report.use(addReportHeaders);
```

## Work with path parameters

A parameter starts with `:` and occupies one path segment:

```ts
api.operation("GET", "/repositories/:owner/:repository", ({ params }) => {
  return Response.json({
    owner: params["owner"],
    repository: params["repository"],
  });
});
```

Parameter names may contain letters, digits, and underscores. The first
character must be a letter or underscore. Each name can appear once in a path.
Simnaril decodes parameter values before passing them to the handler.

## Choose an operation type

Use route configuration when the supplied behavior only has the wrong method
or path. Use a semantic override when the supplied HTTP behavior is correct.
Add a resource operation for a named action on a resource. Add a raw operation
when the handler must build its own `Response`.
