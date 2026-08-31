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
    assertStringIncludes(error.message, `GET ${url} reached SimApi`);
    assertStringIncludes(error.message, "no handler for GET /widgets/");
    assertInstanceOf(unknownError, UnimplementedRouteError);
    assertIdentical(unknownError.pathname, "/status");
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
    // Given an API and an invalid collection path.
    const api = new SimApi();

    // When the path is exposed.
    const error = assertThrowsError(() => {
      api.resource<Widget>({ path: "widgets/" });
    });

    // Then the API explains the required absolute collection form.
    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, 'such as "/widgets"');
    assertStringIncludes(error.message, 'received "widgets/"');
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
