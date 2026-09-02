# Request bodies

Simulated resources read request bodies as JSON. A `decode` function replaces that for a service
that speaks something else on the way in.

## The JSON default

`POST` and `PATCH` on a REST resource parse the body as JSON, and this is what happens when nothing
is configured.

```ts
const api = new SimApi();
const widgets = api.resource<Widget>({ name: "widget", path: "/widgets" });

await fetch("https://api.example.com/widgets", {
  body: JSON.stringify({ name: "First widget" }),
  method: "POST",
});
```

A malformed body throws out of the decode step and reaches the caller as a network error. Decoding
failures stay loud.

## Supply a decoder

Stripe, Rails and PHP applications take `application/x-www-form-urlencoded` and answer with JSON.
Give the resource a `decode` function and its operations read bodies that way.

```ts
const widgets = api.resource<Widget>({
  name: "widget",
  path: "/widgets",
  decode: async (request) =>
    Object.fromEntries(new URLSearchParams(await request.text())),
});
```

A decoder receives the `Request` and returns the input the operation sees. It can be synchronous or
asynchronous, and it can return any shape at all.

```ts
type RequestDecoder = (request: Request) => unknown;
```

The package exports `decodeJson`, the default, for a decoder that wants to fall back to it.

## Three places to configure one

A decoder can be set on the API, on a resource, or on a single operation. The closest one wins, the
way middleware composes.

```ts
const api = new SimApi({ decode: decodeForm });

const widgets = api.resource<Widget>({
  name: "widget",
  path: "/widgets",
  decode: decodeForm,
  operations: {
    update: { decode: decodeJsonPatch },
  },
});

widgets.operation("archive", {
  method: "POST",
  path: "/:id/archive",
  decode: decodeForm,
  handle: ({ input }) => archive(input),
});
```

Setting it once on the API is usually enough. A real service takes one format across every endpoint,
and simulating one is the case this exists for.

## Operations that read no body

`list`, `get` and `delete` are sent no body, and they inherit no decoder from the resource or the
API. There would be nothing there for it to read.

| Operation               | Decoder                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `create`, `update`      | its own, then the resource's, then the API's, then JSON                       |
| `list`, `get`, `delete` | its own, and otherwise none                                                   |
| a resource operation    | its own, then the resource's, then the API's, then JSON (when a body arrives) |

Configuring `decode` on `get` or `delete` is honoured, for the services that do send a body with
one.

A resource operation (`widgets.operation(...)`) is a domain action, so it may be called with a body
or without one. It decodes when a body arrives and hands the handler `undefined` when none does.
