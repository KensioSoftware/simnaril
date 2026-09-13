# Resource state

`SimResource<T>` stores entities in memory. Use its methods to set up a test,
apply changes in a simulated service, and inspect the resulting state.

HTTP routes are added separately by `RestResource`. The state resource itself
works with TypeScript objects.

## Create a resource

Define the entity type and construct a resource:

```ts
import { SimResource } from "@kensio/simnaril";

interface Customer {
  id: string;
  email: string;
  status: "active" | "suspended";
}

const customers = new SimResource<Customer>({ name: "customer" });
```

The optional `name` appears in errors about this resource. For example, a
missing entity is described as a missing customer.

`api.resource()` returns a `RestResource` with the same state methods. When
you create a resource that way, call `customers.seed()` or `customers.get()`
directly on the returned object.

## Seed an exact entity

Use `seed()` to store a complete entity for a test:

```ts
customers.seed({
  id: "customer-1",
  email: "a@example.com",
  status: "suspended",
});
```

Seeding skips the resource's creation function. This lets a test start with a
specific ID, status, or timestamp, including values that normal creation
would not produce.

## Define how the service creates entities

Use `create()` when an entity should go through the simulated service's
creation behavior. Supply a `create` function to generate fields and apply
defaults:

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

By default, the input type is `Partial<Customer>`. The creation function must
return a complete `Customer`, which the resource then stores.

Without a creation function, `create()` stores the object you pass to it.
Supply a complete entity in that case. The resource does not validate an
entity's fields at runtime.

## Read and change entities

All state methods are synchronous:

```ts
customers.get("customer-1");
customers.find("customer-1");
customers.list();
customers.update("customer-1", { status: "active" });
customers.delete("customer-1");
customers.clear();
```

| Method                | Result                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `get(id)`             | Returns the entity or throws `EntityNotFoundError`.                   |
| `find(id)`            | Returns the entity, or `undefined` if it is absent.                   |
| `list()`              | Returns an array of entities in insertion order.                      |
| `update(id, changes)` | Merges fields into an existing entity and returns the updated entity. |
| `delete(id)`          | Removes an existing entity and returns it.                            |
| `clear()`             | Removes every entity from the resource.                               |

`update()` and `delete()` throw `EntityNotFoundError` if the entity is absent.
`seed()` and `create()` throw `DuplicateEntityError` if the identity is already
in use. Both errors expose the identity and optional resource name:

```ts
import { DuplicateEntityError, EntityNotFoundError } from "@kensio/simnaril";
```

The resource stores object references. Reads return the stored objects, and
`list()` creates a new array containing those objects. Use `update()` to change
an entity, especially when a change affects its identity. An update merges
top-level fields and replaces any supplied nested object.

## Choose an entity's identity

The default identity is the entity's string `id` property. Supply `identify`
when the entity uses another field or a combination of fields:

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

This resource stores the issue under `kensio/simnaril#1`. Pass that string to
`get()`, `find()`, `update()`, or `delete()`.

When an update changes an entity's identity, the resource moves it to the new
key. If another entity already uses that key, the update throws
`DuplicateEntityError` and leaves the stored entities unchanged.

## Add HTTP routes to existing state

Pass the state resource to `api.expose()`:

```ts
import { SimApi } from "@kensio/simnaril";

const api = new SimApi();
const customersApi = api.expose(customers, {
  path: "/v1/customers",
});
```

`customersApi` is a `RestResource` backed by `customers`. Direct state calls
and HTTP requests read and change the same entities.

[REST resources](../rest-resources/README.md) describes the routes.
[Composing a simulation](../composing-a-simulation/README.md) shows how two
APIs can share one state resource.
