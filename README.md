# Simnaril

Simnaril is a TypeScript library for simulating third-party HTTP services in a
Node.js process. Application code keeps its production URLs and HTTP clients.
Simnaril intercepts those requests and sends them to stateful service objects in
memory.

```ts
import { SimApi, SimEnvironment } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
}

const api = new SimApi();
const widgets = api.resource<Widget>({ path: "/widgets" });
widgets.seed({ id: "widget-1", name: "First widget" });

using environment = new SimEnvironment();
environment.register("https://api.example.com", api);

const response = await fetch("https://api.example.com/widgets/widget-1");
const widget = (await response.json()) as Widget;
```

Simnaril requires Node.js 24 or later.

## Documentation

- [Getting started](docs/getting-started/README.md)
- [Simulation environments](docs/simulation-environments/README.md)
- [Resource state](docs/resource-state/README.md)
- [REST resources](docs/rest-resources/README.md)
- [Request bodies](docs/request-bodies/README.md)
- [Custom operations](docs/custom-operations/README.md)
- [Middleware](docs/middleware/README.md)
- [Webhooks](docs/webhooks/README.md)
- [Composing a simulation](docs/composing-a-simulation/README.md)
