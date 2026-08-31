# Resource state

`SimResource<T>` stores the entities for one simulated resource in memory. It
contains domain state and has no dependency on HTTP.

## Create a state resource

```ts
import { SimResource } from "@kensio/simnaril";

interface Customer {
  id: string;
  email: string;
  status: "active" | "suspended";
}

const customers = new SimResource<Customer>({ name: "customer" });
```

The optional `name` appears in errors. It makes failures such as a missing
customer easier to understand.

Resources created with `api.resource()` provide the same state methods. Most
tests can call those methods on the returned `RestResource` directly.

## Seed exact state

`seed()` stores a complete entity without running creation behavior:

```ts
customers.seed({
  id: "customer-1",
  email: "a@example.com",
  status: "suspended",
});
```

Use this method to arrange the exact world a test needs, including states that
normal creation would not produce.

## Define creation behavior

`create()` represents creation by the simulated service. Supply a `create`
function when the service generates fields or applies defaults:

```ts
const customers = new SimResource<Customer>({
  name: "customer",
  create(input) {
    return {
      id: crypto.randomUUID(),
      email: input.email ?? "unknown@example.com",
      status: input.status ?? "active",
    };
  },
});

const customer = customers.create({ email: "a@example.com" });
```

The input type is `Partial<Customer>`. The creation function must return a
complete `Customer`.

Without a `create` function, `create()` stores the supplied object as the
entity. Pass a complete entity when using that convention.

## Read and change state

The state methods are synchronous:

```ts
customers.get("customer-1");
customers.find("customer-1");
customers.list();
customers.update("customer-1", { status: "active" });
customers.delete("customer-1");
customers.clear();
```

`get()` returns the entity or throws `EntityNotFoundError`. `find()` returns
`undefined` when the identity is absent. `list()` returns all entities in
insertion order.

`update()` merges a partial object into the stored entity. `delete()` removes an
entity and returns it. Both methods throw `EntityNotFoundError` when the entity
does not exist. `clear()` removes every entity from that resource.

`seed()` and `create()` throw `DuplicateEntityError` when the identity already
exists. Both error classes expose the identity and the optional resource name:

```ts
import { DuplicateEntityError, EntityNotFoundError } from "@kensio/simnaril";
```

## Use another identity

The default identity is the entity's string `id` property. Supply `identify`
for another entity shape or a composite key:

```ts
interface Issue {
  owner: string;
  repository: string;
  number: number;
  title: string;
}

const issues = new SimResource<Issue>({
  name: "issue",
  identify: (issue) => `${issue.owner}/${issue.repository}#${issue.number}`,
});

issues.seed({
  owner: "kensio",
  repository: "simnaril",
  number: 1,
  title: "Write usage documentation",
});

issues.get("kensio/simnaril#1");
```

An update can change an entity's identity. The resource then moves the entity
to the new key. The update fails if that key already belongs to another entity.

## Expose existing state over HTTP

Use `api.expose()` to add HTTP routes to an existing resource:

```ts
import { SimApi } from "@kensio/simnaril";

const api = new SimApi();
const customersApi = api.expose(customers, {
  path: "/v1/customers",
});
```

The returned `RestResource` delegates its state methods to `customers`. Read
[REST resources](../rest-resources/README.md) for the supplied routes and
[Composing a simulation](../composing-a-simulation/README.md) for sharing one
state resource between APIs.
