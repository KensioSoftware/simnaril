# Composing a simulation

Use a factory function to construct the simulated services your application
needs. Each call creates a new environment and new resource state. Tests
reuse the definition and arrange their own data.

## Put service definitions in a factory

This example creates billing and source-control services in one environment:

```ts
import { SimApi, SimEnvironment } from "@kensio/simnaril";

interface Customer {
  id: string;
  email: string;
}

interface Issue {
  id: string;
  title: string;
}

export function createApplicationSim() {
  const environment = new SimEnvironment();

  const billingApi = new SimApi();
  const customers = billingApi.resource<Customer>({
    name: "customer",
    path: "/v1/customers",
  });

  const sourceControlApi = new SimApi();
  const issues = sourceControlApi.resource<Issue>({
    name: "issue",
    path: "/issues",
  });

  environment.register("https://billing.example.com", billingApi);
  environment.register("https://source.example.com", sourceControlApi);

  return {
    billing: { api: billingApi, customers },
    environment,
    sourceControl: { api: sourceControlApi, issues },
    [Symbol.dispose]() {
      environment.dispose();
    },
  };
}
```

The factory defines the routes and registers each API under its production
origin. Application requests to those origins reach the matching API.

The returned object gives tests access to the resources through
`sim.billing.customers` and `sim.sourceControl.issues`. Its `Symbol.dispose`
method releases the environment when a `using sim` scope ends.

## Arrange state and run the application

Create the simulation, seed the data the application needs, then call the
application:

```ts
using sim = createApplicationSim();

sim.billing.customers.seed({
  id: "customer-1",
  email: "a@example.com",
});

sim.sourceControl.issues.seed({
  id: "issue-1",
  title: "Example issue",
});

await runApplication();

const customer = sim.billing.customers.get("customer-1");
const issues = sim.sourceControl.issues.list();
```

`runApplication()` stands for your application code, which makes its ordinary
HTTP requests. After it completes, inspect the resources to check the effects
of those requests.

Create a fresh simulation for each test. Dispose it before another test in
the same Node.js process registers the same origins. Tests in separate
processes can each use those origins.

## Give each simulation the same starting data

Seed data inside the factory when every test needs it. For example, add these
plans after constructing `billingApi` and before returning the simulation:

```ts
interface Plan {
  id: string;
  name: string;
}

const plans = billingApi.resource<Plan>({ path: "/v1/plans" });

plans.seed({ id: "free", name: "Free" });
plans.seed({ id: "business", name: "Business" });
```

Each factory call creates its own plan entities. A test can change them
without affecting the next simulation. To expose `plans` to tests, include
it in the returned `billing` object alongside `customers`.

Create a new simulation to restore this starting state. `SimResource.clear()`
empties one resource. It does not restore entities seeded by the factory.

## Share state between API versions

Construct a `SimResource` separately when two APIs should expose the same
entities:

```ts
import { SimApi, SimResource } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
}

const state = new SimResource<Widget>({ name: "widget" });

const apiV1 = new SimApi();
const apiV2 = new SimApi();

const v1Widgets = apiV1.expose(state, { path: "/v1/widgets" });
const v2Widgets = apiV2.expose(state, { path: "/v2/things" });

v1Widgets.seed({ id: "widget-1", name: "First widget" });
v2Widgets.get("widget-1");
```

Both returned `RestResource` objects use `state`. Seeding through `v1Widgets`
makes the entity available through `v2Widgets`. HTTP requests handled by
either API read and update the same entities.

Each API still has its own routes and middleware. This example changes only
the URL paths. Use custom operations when the API versions also need different
request or response formats.

## Keep definitions separate from test setup

Put route definitions, creation functions, middleware, and shared starting
data in the factory. A test then creates a simulation, arranges its resource
state, runs application code, and checks the resulting state.

When a test needs a service to fail, change the state that causes the failure.
For example, revoke a token that the authentication middleware reads. Keep
that behavior in the service definition where all tests can use it.
