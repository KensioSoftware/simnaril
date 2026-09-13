# Custom operations

Customize an operation when a service needs behavior beyond the built-in REST
routes. Simnaril lets you replace a route's handler, add an action to a
resource, or handle a request directly.

## Choose how to customize an operation

| What you need                                             | API to use                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Change a built-in route's method or path                  | Resource `operations` configuration                                         |
| Change what a built-in operation does                     | `resource.operations.create.override()` or another operation's `override()` |
| Add an action such as archive or cancel                   | `resource.operation()`                                                      |
| Read the request and build the complete response yourself | `api.operation()`                                                           |

[REST resources](../rest-resources/README.md) covers method and path
configuration. The examples below start with this API and resource:

```ts
import { SimApi } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
  status: "active" | "archived";
}

const api = new SimApi();
const widgets = api.resource<Widget>({ path: "/widgets" });
```

Define these operations while constructing the simulation. Tests can then
arrange resource state and call the application.

## Replace a built-in operation's handler

Use `override()` to change what an operation does while keeping its route,
request decoding, and response format:

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

Here, creation uses a request header for the ID when one is present. It also
uses the `prefix` query parameter to build a default name.

The handler receives the decoded `input` and the `resource`. It also receives
HTTP context through `request`, `params`, and `query`.

Return the value that should become the response body. For this create
operation, Simnaril encodes that value as JSON with status `201`. The API's
error handling still applies.

## Add an action to a resource

Use `resource.operation()` for an action on a resource, such as archiving a
widget:

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

The path is appended to `/widgets`, giving
`POST /widgets/:id/archive`. A caller sends a JSON body such as
`{"reason":"No longer needed"}`. The handler updates the stored widget and
returns it.

The type arguments describe the decoded input and returned value. They do
not validate the request body at runtime. Validate input in the handler or a
custom decoder if the simulation needs to reject invalid requests.

By default, Simnaril decodes a body as JSON and passes it as `input`. It uses
a configured decoder when one is supplied. A bodyless request passes
`undefined`. Returning a value produces JSON with status `200`. Returning
`undefined` produces status `204` with no body.

The returned operation has a `use()` method for
[middleware](../middleware/README.md):

```ts
archive.use(async ({ request }, next) => {
  console.log(request.method, request.url);
  return next();
});
```

## Handle the request and response directly

Use `api.operation()` when you need to build the complete `Response`:

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

A raw operation's path starts at the API root. Simnaril matches the method
and path, decodes path parameters, and supplies `query` as `URLSearchParams`.
The handler reads any request body and returns the response, including its
status and headers.

Raw operations also support middleware:

```ts
report.use(async (_context, next) => {
  const response = await next();
  response.headers.set("x-report-version", "1");
  return response;
});
```

## Use path parameters

A parameter starts with `:` and captures one path segment:

```ts
api.operation("GET", "/repositories/:owner/:repository", ({ params }) => {
  return Response.json({
    owner: params["owner"],
    repository: params["repository"],
  });
});
```

For `/repositories/kensio/simnaril`, the handler receives `owner` as `"kensio"`
and `repository` as `"simnaril"`.

Parameter names start with a letter or underscore and can also contain
digits. Each name can appear only once in a path. Parameter values are
URL-decoded before the handler receives them. Use `requirePathParameter()`
when you want an error if a required parameter is missing.

A parameter can also end with a literal `:<verb>` suffix, as used by
[Google custom methods](https://google.aip.dev/136):

```ts
api.operation(
  "POST",
  "/v1/projects/-/serviceAccounts/:email:generateAccessToken",
  ({ params }) => {
    const email = requirePathParameter(params, "email");
    return Response.json({ accessToken: `token-for-${email}` });
  },
);
```

A request for `/v1/projects/-/serviceAccounts/service%40example.com:generateAccessToken`
supplies `email` as `"service@example.com"`. The parameter captures everything
before the suffix within that segment. The suffix matches literally, including
case. Verb names follow the same naming rules as parameters.

The captured value must be nonempty. A parameter never spans a literal `/`.
Percent-encoded values are decoded once after matching, including an encoded
slash. A different verb or malformed percent encoding leaves the route
unmatched.

When routes overlap, a fully literal path takes priority over a parameterized
path. A parameter with a method suffix takes priority over a whole-segment
parameter in the same position. These priorities apply in either registration
order. Custom-method paths also work in resource actions and configured
built-in operations (for example, `path: "/:id:archive"`).
