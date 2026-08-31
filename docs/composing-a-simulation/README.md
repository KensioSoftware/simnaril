# Composing a simulation

Define a simulated service in a factory function. The function constructs the
environment, APIs, resources, middleware, and operations as one object graph.

## Build a composition root

This example defines two services that share one environment:

```ts
import { SimApi, SimEnvironment, type RestResource } from "@kensio/simnaril";

interface Customer {
  id: string;
  email: string;
}

interface Issue {
  id: string;
  title: string;
}

interface ApplicationSim extends Disposable {
  billing: {
    api: SimApi;
    customers: RestResource<Customer>;
  };
  environment: SimEnvironment;
  sourceControl: {
    api: SimApi;
    issues: RestResource<Issue>;
  };
}

export function createApplicationSim(): ApplicationSim {
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

The returned object gives tests direct access to the state they arrange and
inspect. Application code reaches the same state through HTTP.

## Arrange state in a test

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

Construct a fresh graph for each test or test worker. Fresh resources provide
state isolation without shared setup and cleanup.

## Define baseline state

Seed state inside the factory when every new simulation should start with it:

```ts
const plans = billingApi.resource<Plan>({ path: "/v1/plans" });

plans.seed({ id: "free", name: "Free" });
plans.seed({ id: "business", name: "Business" });
```

Each call to the factory creates that baseline in new resource instances.
Tests can add or change state without affecting another simulation.

## Share state between HTTP representations

Create a `SimResource` separately when two API versions or services expose the
same domain state:

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

Both `RestResource` objects delegate to `state`. An HTTP update through either
API is visible through both representations.

## Keep service behavior together

The factory is the definition of the simulated world. Put route definitions,
creation behavior, middleware, and baseline state there. Tests should usually
work with the returned state methods.

A test can then read in four steps:

1. Create the simulation.
2. Arrange its state.
3. Run the application.
4. Inspect the resulting state.
