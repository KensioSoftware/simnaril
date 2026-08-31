# Simnaril

In-process third-party API simulator

## Run an application against a simulated service

A simulation is an object with domain state and an HTTP handler. Register it
under the service's production origin, then call the application without
changing its base URL.

```ts
import { SimEnvironment, type SimService } from "@kensio/simnaril";

interface Widget {
  id: string;
  name: string;
}

class SimWidgets implements SimService {
  readonly #widgets = new Map<string, Widget>();

  create(widget: Widget): void {
    this.#widgets.set(widget.id, widget);
  }

  handle(request: Request): Response {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/v1/widgets") {
      return Response.json([...this.#widgets.values()]);
    }

    return new Response("Not found", { status: 404 });
  }
}

const widgets = new SimWidgets();
widgets.create({ id: "widget-1", name: "First widget" });

using sim = new SimEnvironment();
sim.register("https://api.example.com", widgets);

const response = await fetch("https://api.example.com/v1/widgets");
const result = await response.json();
```

`SimEnvironment` routes every path at the registered origin to the same
service. Leaving the `using` scope stops interception for that environment.
An origin has one owner while its environment is active. A second registration
throws, and disposal releases the origin.

## Design decisions

- [HTTP interception](docs/decisions/http-interception.md)
