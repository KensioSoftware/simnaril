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

## Form encoding

Stripe, Rails and PHP applications take `application/x-www-form-urlencoded` and answer with JSON.
`decodeForm` reads that format, including the bracketed nesting all three of them write.

```ts
import { decodeForm, SimApi } from "@kensio/simnaril";

const api = new SimApi({ decode: decodeForm });
```

A body of

```text
line_items[0][price_data][unit_amount]=250&line_items[0][quantity]=1&expand[]=customer
```

reaches the operation as

```json
{
  "line_items": [{ "price_data": { "unit_amount": "250" }, "quantity": "1" }],
  "expand": ["customer"]
}
```

Every leaf is a string. A form body carries no types, and guessing at them would make `quantity=1`
and `postcode=01234` disagree about what a digit is. Convert in the resource's own creation
behaviour, where the target shape is known.

Name the decoded shape with the second type argument to `resource()`:

```ts
interface CheckoutSession {
  amountTotal: number;
  id: string;
}

interface CreateCheckoutSession {
  line_items?: {
    price_data?: { unit_amount?: string };
    quantity?: string;
  }[];
}

const sessions = api.resource<CheckoutSession, CreateCheckoutSession>({
  path: "/v1/checkout/sessions",
  create(input) {
    return {
      amountTotal: totalOf(input.line_items ?? []),
      id: crypto.randomUUID(),
    };
  },
});
```

The second type argument defaults to `Partial<CheckoutSession>`. It describes the input to the
resource's `create` function, its direct `create()` method and the supplied create operation.

The supplied update operation keeps `Partial<T>` as its input type. Its default behaviour merges
the decoded object into the stored entity. The decoded fields therefore have to match the entity.
Disable the supplied update and add a typed resource operation when an API uses another wire shape
for updates.

A part that is a run of digits makes an array, and an empty bracket appends to one. The digits order
the entries and do not position them, so `a[0]`, `a[5]` and `a[9]` give three elements and never a
sparse array of ten. A real encoder counts from zero, where the two readings agree.

`decodeForm` ignores the `content-type` header. What a body claims to be and what it holds are two
facts, and choosing the decoder by hand has already settled the first.

### What it refuses

A real encoder emits well-formed keys. The bodies below are hostile or mistaken input, and each one
throws a `SyntaxError`, the way a malformed JSON body already does.

| Body            | Refused because                                                                    |
| --------------- | ---------------------------------------------------------------------------------- |
| `name=a&name=b` | Which value wins is a guess. Losing half a request quietly is worse than stopping. |
| `a=1&a[b]=2`    | `a` would have to hold a value and more keys at once                               |
| `a[][b]=1`      | An empty bracket appends, and only the last part can                               |
| `a[b`, `[a]`    | Brackets cannot be read out of the key                                             |

## Write your own

A decoder receives the `Request` and returns the input the operation sees. It can be synchronous or
asynchronous, and it can return any shape at all.

```ts
type RequestDecoder = (request: Request) => unknown;
```

```ts
const widgets = api.resource<Widget>({
  name: "widget",
  path: "/widgets",
  decode: async (request) => parseXml(await request.text()),
});
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
  operations: {
    update: { decode: decodeJson },
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

| Operation               | Decoder                                                 | Runs                |
| ----------------------- | ------------------------------------------------------- | ------------------- |
| `create`, `update`      | its own, then the resource's, then the API's, then JSON | always              |
| `list`, `get`, `delete` | its own, and otherwise none                             | when a body arrives |
| a resource operation    | its own, then the resource's, then the API's, then JSON | when a body arrives |

Configuring `decode` on `get` or `delete` is honoured, for the services that do send a body with
one. It runs only when a body actually arrived, and the handler is given `undefined` otherwise. An
ordinary bodyless `DELETE` to an operation configured with `decodeJson` would answer
`Unexpected end of JSON input` without that.

A resource operation (`widgets.operation(...)`) is a domain action. It may be called with a body or
without one, so it decodes on the same terms.

`create` and `update` are different. A `POST` with no body is a malformed create, and its decoder
runs and fails, which is the loud behaviour a malformed JSON body has always had.
