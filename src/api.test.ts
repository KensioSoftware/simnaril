import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expectTypeOf, it } from "vitest";

import {
  SimApi,
  SimEnvironment,
  SimResource,
  type SimService,
  UnimplementedRouteError,
} from "./index.js";

describe("a simulated API", () => {
  interface Widget {
    id: string;
    name: string;
    status: "active" | "archived";
  }

  const pathParameter = (
    params: Readonly<Record<string, string>>,
    name: string,
  ): string => {
    const value = params[name];

    if (value === undefined) {
      throw new Error(`Missing test path parameter ":${name}".`);
    }

    return value;
  };

  const request = (
    method: string,
    path: string,
    body?: Partial<Widget>,
  ): Request => {
    const url = `https://api.example.test${path}`;

    if (body === undefined) {
      return new Request(url, { method });
    }

    return new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    });
  };

  it("serves conventional CRUD through the SimService handler", async () => {
    // Given an API resource with state arranged through its delegated API.
    const api = new SimApi();
    const service: SimService = api;
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const seeded: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    const created: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(seeded);

    // When application requests run through every conventional operation.
    const listResponse = await service.handle(request("GET", "/widgets"));
    const getResponse = await service.handle(
      request("GET", `/widgets/${seeded.id}`),
    );
    const createResponse = await service.handle(
      request("POST", "/widgets", created),
    );
    const updateResponse = await service.handle(
      request("PATCH", `/widgets/${created.id}`, { status: "archived" }),
    );
    const deleteResponse = await service.handle(
      request("DELETE", `/widgets/${seeded.id}`),
    );

    // Then methods, status codes and bodies follow the JSON CRUD convention,
    // and direct calls see the resulting state.
    assertResponseStatus(listResponse, 200);
    assertObjectEquals(await listResponse.json(), [seeded]);
    assertResponseStatus(getResponse, 200);
    assertObjectEquals(await getResponse.json(), seeded);
    assertResponseStatus(createResponse, 201);
    assertIdentical(
      createResponse.headers.get("content-type"),
      "application/json",
    );
    assertObjectEquals(await createResponse.json(), created);
    assertResponseStatus(updateResponse, 200);
    assertObjectEquals(await updateResponse.json(), {
      ...created,
      status: "archived",
    });
    assertResponseStatus(deleteResponse, 204);
    assertIdentical(await deleteResponse.text(), "");
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- RestResource.find takes an identity.
    assertUndefined(widgets.find(seeded.id));
    assertObjectEquals(widgets.get(created.id), {
      ...created,
      status: "archived",
    });
  });

  it("delegates every state operation from RestResource", () => {
    // Given an exposed resource with service-specific creation behaviour.
    const generatedId = faker.string.uuid();
    const widgets = new SimApi().resource<Widget>({
      path: "/widgets",
      create: (input) => ({
        id: generatedId,
        name: input.name ?? faker.commerce.productName(),
        status: "active",
      }),
    });
    const seeded: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };

    // When callers use the complete state API on the HTTP resource.
    const seedResult = widgets.seed(seeded);
    const createResult = widgets.create({ name: faker.commerce.productName() });
    const getResult = widgets.get(seeded.id);
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- RestResource.find takes an identity.
    const findResult = widgets.find(generatedId);
    const listResult = widgets.list();
    const updateResult = widgets.update(generatedId, { status: "archived" });
    const deleteResult = widgets.delete(seeded.id);
    widgets.clear();

    // Then the methods retain the SimResource types and operate on its state.
    expectTypeOf(seedResult).toEqualTypeOf<Widget>();
    expectTypeOf(createResult).toEqualTypeOf<Widget>();
    expectTypeOf(getResult).toEqualTypeOf<Widget>();
    expectTypeOf(findResult).toEqualTypeOf<Widget | undefined>();
    expectTypeOf(listResult).toEqualTypeOf<Widget[]>();
    expectTypeOf(updateResult).toEqualTypeOf<Widget>();
    expectTypeOf(deleteResult).toEqualTypeOf<Widget>();
    assertIdentical(seedResult, seeded);
    assertIdentical(getResult, seeded);
    assertIdentical(findResult, createResult);
    assertObjectEquals(listResult, [seeded, createResult]);
    assertIdentical(deleteResult, seeded);
    assertObjectEquals(widgets.state.list(), []);
  });

  it("exposes one state resource through more than one API", async () => {
    // Given one state resource exposed under two API versions.
    const state = new SimResource<Widget>({});
    const firstApi = new SimApi();
    const secondApi = new SimApi();
    const firstVersion = firstApi.expose(state, { path: "/v1/widgets" });
    const secondVersion = secondApi.expose(state, { path: "/v2/things" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    firstVersion.seed(widget);

    // When one API updates the resource over HTTP.
    const updateResponse = await secondApi.handle(
      request("PATCH", `/v2/things/${widget.id}`, { status: "archived" }),
    );
    const firstResponse = await firstApi.handle(
      request("GET", `/v1/widgets/${widget.id}`),
    );

    // Then both HTTP representations and both direct wrappers see one state.
    assertResponseStatus(updateResponse, 200);
    assertResponseStatus(firstResponse, 200);
    assertObjectEquals(await firstResponse.json(), {
      ...widget,
      status: "archived",
    });
    assertIdentical(firstVersion.state, state);
    assertIdentical(secondVersion.state, state);
    assertIdentical(secondVersion.get(widget.id), firstVersion.get(widget.id));
  });

  it("selects the most specific matching resource path", async () => {
    // Given a nested collection whose path can also identify an outer entity.
    const api = new SimApi();
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const favourites = api.resource<Widget>({ path: "/widgets/favourites" });
    const outerWidget: Widget = {
      id: "favourites",
      name: faker.commerce.productName(),
      status: "active",
    };
    const favourite: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(outerWidget);
    favourites.seed(favourite);

    // When the nested collection path is requested.
    const response = await api.handle(request("GET", "/widgets/favourites"));

    // Then the nested collection handles it ahead of the outer item route.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), [favourite]);
  });

  it("rejects duplicate resource collection paths", () => {
    // Given an API with an exposed resource collection.
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });

    // When another resource uses the same collection path.
    const error = assertThrowsError(() => {
      api.resource<Widget>({ path: "/widgets" });
    });

    // Then registration fails before the route becomes ambiguous.
    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, "already exposed at collection path");
  });

  it("maps missing and duplicate entities to simulated responses", async () => {
    // Given an API resource containing one entity.
    const api = new SimApi();
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);
    const missingId = faker.string.uuid();

    // When HTTP operations encounter state-layer domain errors.
    const missingResponse = await api.handle(
      request("GET", `/widgets/${missingId}`),
    );
    const duplicateResponse = await api.handle(
      request("POST", "/widgets", widget),
    );

    // Then the API maps them to JSON 404 and 409 responses.
    assertResponseStatus(missingResponse, 404);
    assertObjectEquals(await missingResponse.json(), {
      error: `No entity exists with identity "${missingId}".`,
    });
    assertResponseStatus(duplicateResponse, 409);
    assertObjectEquals(await duplicateResponse.json(), {
      error: `An entity already exists with identity "${widget.id}".`,
    });
    assertObjectEquals(widgets.list(), [widget]);
  });

  it("configures a supplied operation route without replacing its behaviour", async () => {
    // Given an update operation moved to a service-specific method and path.
    const api = new SimApi();
    const service: SimService = api;
    const widgets = api.resource<Widget>({
      path: "/widgets",
      operations: {
        update: {
          method: "POST",
          path: "/:id/changes",
        },
      },
    });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);

    // When the configured route receives a partial update.
    const response = await service.handle(
      request("POST", `/widgets/${widget.id}/changes`, {
        status: "archived",
      }),
    );
    const oldRoute = await assertThrowsErrorAsync(async () =>
      service.handle(
        request("PATCH", `/widgets/${widget.id}`, { status: "active" }),
      ),
    );

    // Then the supplied update behaviour and encoding run only at the new route.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), {
      ...widget,
      status: "archived",
    });
    assertObjectEquals(widgets.get(widget.id), {
      ...widget,
      status: "archived",
    });
    assertInstanceOf(oldRoute, UnimplementedRouteError);
  });

  it("keeps the HTTP pipeline around a semantic operation override", async () => {
    // Given a create override which uses decoded input and HTTP context.
    const api = new SimApi();
    const service: SimService = api;
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const generatedId = faker.string.uuid();
    const suffix = faker.word.noun();
    widgets.operations.create.override({
      handle({ input, query, request: operationRequest, resource }) {
        return resource.create({
          id: operationRequest.headers.get("x-widget-id") ?? generatedId,
          name: `${input.name ?? "Untitled"} ${query.get("suffix") ?? ""}`,
          status: "active",
        });
      },
    });
    const name = faker.commerce.productName();
    const createRequest = new Request(
      `https://api.example.test/widgets?suffix=${encodeURIComponent(suffix)}`,
      {
        body: JSON.stringify({ name }),
        headers: {
          "content-type": "application/json",
          "x-widget-id": generatedId,
        },
        method: "POST",
      },
    );
    const duplicateRequest = createRequest.clone();

    // When the override succeeds, then encounters a state-layer domain error.
    const created = await service.handle(createRequest);
    const duplicate = await service.handle(duplicateRequest);
    const fetched = await service.handle(
      request("GET", `/widgets/${generatedId}`),
    );

    // Then routing, decoding, error translation and encoding remain supplied.
    const expected = {
      id: generatedId,
      name: `${name} ${suffix}`,
      status: "active",
    };
    assertResponseStatus(created, 201);
    assertIdentical(created.headers.get("content-type"), "application/json");
    assertObjectEquals(await created.json(), expected);
    assertResponseStatus(duplicate, 409);
    assertObjectEquals(await duplicate.json(), {
      error: `An entity already exists with identity "${generatedId}".`,
    });
    assertResponseStatus(fetched, 200);
    assertObjectEquals(await fetched.json(), expected);
  });

  it("runs resource and raw operations through the SimService handler", async () => {
    // Given a resource domain action and an unrelated raw HTTP operation.
    const api = new SimApi();
    const service: SimService = api;
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);
    widgets.operation("archive", {
      method: "POST",
      path: "/:id/archive",
      handle({ params, query, resource }) {
        const status = query.get("confirm") === "yes" ? "archived" : "active";
        return resource.update(pathParameter(params, "id"), { status });
      },
    });
    const reportOperation = api.operation(
      "GET",
      "/reports/:reportId",
      ({ params, query, request }) =>
        Response.json(
          {
            method: request.method,
            reportId: params["reportId"],
            view: query.get("view"),
          },
          { status: 202 },
        ),
    );
    reportOperation.use(async (_context, next) => {
      const response = await next();
      response.headers.set("x-report-operation", "raw");
      return response;
    });
    const reportId = faker.string.alpha({ length: 12 });

    // When both custom operations are called through the public service entry point.
    const archived = await service.handle(
      request("POST", `/widgets/${widget.id}/archive?confirm=yes`),
    );
    const report = await service.handle(
      request("GET", `/reports/${encodeURIComponent(reportId)}?view=condensed`),
    );

    // Then the resource action uses resource state and the raw route gets parsed context.
    assertResponseStatus(archived, 200);
    assertObjectEquals(await archived.json(), {
      ...widget,
      status: "archived",
    });
    assertObjectEquals(widgets.get(widget.id), {
      ...widget,
      status: "archived",
    });
    assertResponseStatus(report, 202);
    assertIdentical(report.headers.get("x-report-operation"), "raw");
    assertObjectEquals(await report.json(), {
      method: "GET",
      reportId,
      view: "condensed",
    });
  });

  it("runs middleware as an API, resource and operation onion", async () => {
    // Given middleware at every scope around a resource operation.
    const api = new SimApi();
    const service: SimService = api;
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);
    const events: string[] = [];
    const middleware =
      (scope: string) =>
      async (
        _context: Parameters<Parameters<typeof api.use>[0]>[0],
        next: () => Promise<Response>,
      ): Promise<Response> => {
        events.push(`${scope}:request`);
        const response = await next();
        events.push(`${scope}:response`);
        response.headers.append("x-middleware", scope);
        return response;
      };
    api.use(middleware("api"));
    widgets.use(middleware("resource"));
    const archive = widgets.operation("archive", {
      method: "POST",
      path: "/:id/archive",
      handle({ params, resource }) {
        events.push("operation");
        return resource.update(pathParameter(params, "id"), {
          status: "archived",
        });
      },
    });
    archive.use(middleware("operation"));

    // When the operation runs through SimService.handle.
    const response = await service.handle(
      request("POST", `/widgets/${widget.id}/archive`),
    );

    // Then requests enter API first and responses unwind in reverse order.
    assertResponseStatus(response, 200);
    assertObjectEquals(events, [
      "api:request",
      "resource:request",
      "operation:request",
      "operation",
      "operation:response",
      "resource:response",
      "api:response",
    ]);
    assertIdentical(
      response.headers.get("x-middleware"),
      "operation, resource, api",
    );
  });

  it("shares one request context between middleware and its operation", async () => {
    // Given middleware which enriches the parsed request query.
    const api = new SimApi();
    const queryName = faker.word.noun();
    const queryValue = faker.word.adjective();
    api.use((context, next) => {
      context.query.set(queryName, queryValue);
      return next();
    });
    api.operation("GET", "/status", ({ query }) =>
      Response.json({ enriched: query.get(queryName) }),
    );

    // When the request reaches the operation through that middleware.
    const response = await api.handle(request("GET", "/status"));

    // Then the operation sees the context value added by middleware.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), { enriched: queryValue });
  });

  it("decodes resource operation input and permits an empty semantic result", async () => {
    // Given a resource operation which accepts JSON and changes state in place.
    const api = new SimApi();
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);
    let receivedReason: string | undefined;
    widgets.operation<{ reason: string }>("archive", {
      method: "POST",
      path: "/:id/archive",
      handle({ input, params, resource }) {
        receivedReason = input.reason;
        resource.update(pathParameter(params, "id"), { status: "archived" });
      },
    });
    const reason = faker.lorem.sentence();

    // When the action receives a request body and returns no semantic value.
    const response = await api.handle(
      new Request(`https://api.example.test/widgets/${widget.id}/archive`, {
        body: JSON.stringify({ reason }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    // Then Simnaril decodes the input and encodes the empty result as 204.
    assertIdentical(receivedReason, reason);
    assertResponseStatus(response, 204);
    assertIdentical(await response.text(), "");
    assertIdentical(widgets.get(widget.id).status, "archived");
  });

  it("rejects ambiguous operation names and malformed routes", () => {
    // Given an API resource and invalid custom operation definitions.
    const api = new SimApi();
    const widgets = api.resource<Widget>({ path: "/widgets" });

    // When definitions reuse a supplied name or provide malformed route data.
    const duplicateName = assertThrowsError(() => {
      widgets.operation("create", {
        method: "POST",
        path: "/alternate",
        handle: () => undefined,
      });
    });
    const relativePath = assertThrowsError(() => {
      widgets.operation("archive", {
        method: "POST",
        path: ":id/archive",
        handle: () => undefined,
      });
    });
    const invalidParameter = assertThrowsError(() => {
      api.operation("GET", "/reports/:report-id", () => new Response());
    });
    const duplicateParameter = assertThrowsError(() => {
      api.operation("GET", "/:id/reports/:id", () => new Response());
    });
    const invalidPath = assertThrowsError(() => {
      api.operation("GET", "reports", () => new Response());
    });
    const invalidMethod = assertThrowsError(() => {
      api.operation("GET REPORT", "/reports", () => new Response());
    });
    const missingRequiredParameters = (
      ["get", "update", "delete"] as const
    ).map((operationName) =>
      assertThrowsError(() => {
        new SimApi().resource<Widget>({
          path: "/widgets",
          operations: {
            [operationName]: { path: `/${operationName}` },
          },
        });
      }),
    );

    // Then each definition fails before it can register an ambiguous route.
    for (const error of [
      duplicateName,
      relativePath,
      invalidParameter,
      duplicateParameter,
      invalidPath,
      invalidMethod,
      ...missingRequiredParameters,
    ]) {
      assertInstanceOf(error, TypeError);
    }
    assertStringIncludes(
      duplicateName.message,
      'named "create" already exists',
    );
    assertStringIncludes(relativePath.message, "resource operation path");
    assertStringIncludes(invalidParameter.message, "named path parameter");
    assertStringIncludes(duplicateParameter.message, "appears more than once");
    assertStringIncludes(invalidPath.message, "absolute operation path");
    assertStringIncludes(invalidMethod.message, "Expected an HTTP method");
    for (const error of missingRequiredParameters) {
      assertStringIncludes(error.message, 'must include path parameter ":id"');
    }
  });

  it("matches a raw operation at the API root", async () => {
    // Given a raw operation at the shortest valid route.
    const api = new SimApi();
    api.operation("GET", "/", ({ params }) => Response.json(params));

    // When the root path is handled.
    const response = await api.handle(request("GET", "/"));

    // Then the empty path template supplies an empty parameter object.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), {});
  });

  it("refuses middleware which calls next more than once", async () => {
    // Given API middleware which dispatches its downstream operation twice.
    const api = new SimApi();
    api.operation("GET", "/status", () => new Response("ready"));
    api.use(async (_context, next) => {
      await next();
      return next();
    });

    // When a request reaches the invalid middleware.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(request("GET", "/status")),
    );

    // Then the onion rejects the second dispatch.
    assertIdentical(error.message, "Middleware called next() more than once.");
  });

  it("fails loudly for an unimplemented route", async () => {
    // Given an API that implements only conventional widget routes.
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });
    const url = `https://api.example.test/widgets/${faker.string.uuid()}/archive?force=true`;
    const unknownUrl = "https://api.example.test/status";

    // When application code calls an unimplemented resource operation and an
    // unknown path.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(new Request(url, { method: "GET" })),
    );
    const unknownError = await assertThrowsErrorAsync(() =>
      api.handle(new Request(unknownUrl)),
    );

    // Then both throw route errors instead of returning simulated 404s.
    assertInstanceOf(error, UnimplementedRouteError);
    assertIdentical(error.method, "GET");
    assertIdentical(error.url, url);
    assertIdentical(
      error.message,
      `GET ${url} reached SimApi, but SimApi has no handler for GET ${new URL(url).pathname}.`,
    );
    assertInstanceOf(unknownError, UnimplementedRouteError);
    assertIdentical(unknownError.pathname, "/status");
    assertIdentical(
      unknownError.message,
      `GET ${unknownUrl} reached SimApi, but SimApi has no handler for GET /status.`,
    );
  });

  it("keeps a missing entity distinct from an unimplemented route through fetch", async () => {
    // Given a simulated origin with conventional widget routes.
    const origin = `https://${faker.internet.domainName()}`;
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });
    using environment = new SimEnvironment();
    environment.register(origin, api);
    const missingId = faker.string.uuid();
    const missingUrl = `${origin}/widgets/${missingId}`;
    const unimplementedUrl = `${origin}/status`;

    // When application code requests a missing widget and an unknown route.
    const missingResponse = await fetch(missingUrl);
    const routeError = await assertThrowsErrorAsync(() =>
      fetch(unimplementedUrl),
    );

    // Then the matched route returns its simulated 404, while the unknown route
    // throws the complete public route error.
    assertResponseStatus(missingResponse, 404);
    assertObjectEquals(await missingResponse.json(), {
      error: `No entity exists with identity "${missingId}".`,
    });
    assertInstanceOf(routeError, TypeError);
    assertInstanceOf(routeError.cause, UnimplementedRouteError);
    assertIdentical(
      routeError.cause.message,
      `GET ${unimplementedUrl} reached SimApi, but SimApi has no handler for GET /status.`,
    );
  });

  it("routes ordinary fetch calls through SimApi", async () => {
    // Given a SimApi registered as the service for a production-style origin.
    const origin = `https://${faker.internet.domainName()}`;
    const api = new SimApi();
    const widgets = api.resource<Widget>({ path: "/widgets" });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "active",
    };
    widgets.seed(widget);
    using environment = new SimEnvironment();
    environment.register(origin, api);

    // When application code uses fetch against that origin.
    const response = await fetch(`${origin}/widgets/${widget.id}`);

    // Then SimEnvironment reaches the public SimService handler on SimApi.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), widget);
  });

  it("rejects a path that cannot identify collection and item routes", () => {
    // Given an API and collection paths that URL parsing would change.
    const api = new SimApi();
    const invalidPaths = [
      "widgets/",
      "/widgets?version=1",
      "/widgets#v1",
      "/widgets/../things",
      "/widget collection",
    ];

    // When each path is exposed.
    const errors = invalidPaths.map((path) =>
      assertThrowsError(() => {
        api.resource<Widget>({ path });
      }),
    );

    // Then the API rejects every non-canonical collection form.
    for (const [index, error] of errors.entries()) {
      assertInstanceOf(error, TypeError);
      assertStringIncludes(error.message, 'such as "/widgets"');
      assertStringIncludes(error.message, `received "${invalidPaths[index]}"`);
    }
  });

  it("treats malformed item identity encoding as an unimplemented route", async () => {
    // Given an API resource and an item path with malformed percent encoding.
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });
    const malformedUrl = "https://api.example.test/widgets/%E0%A4%A";

    // When the malformed item path is handled.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(new Request(malformedUrl)),
    );

    // Then route matching stays loud through the public route error.
    assertInstanceOf(error, UnimplementedRouteError);
    assertIdentical(error.pathname, "/widgets/%E0%A4%A");
  });

  it("lets codec and transformation failures stay loud", async () => {
    // Given an API resource and a malformed JSON request.
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });
    const malformed = new Request("https://api.example.test/widgets", {
      body: "not-json",
      method: "POST",
    });

    // When the request fails during the decode pipeline step.
    const error = await assertThrowsErrorAsync(() => api.handle(malformed));

    // Then the codec error remains distinct from mapped domain errors.
    assertInstanceOf(error, SyntaxError);
  });
});
