import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  requirePathParameter,
  SimApi,
  SimEnvironment,
  SimResource,
  UnimplementedRouteError,
} from "../index.js";

describe("custom methods in route parameters", () => {
  it("captures and decodes service accounts through intercepted HTTP", async () => {
    // Given accounts whose custom method reads their simulated state.
    const accounts = new SimResource<{ id: string; accessToken: string }>({});
    const account = accounts.seed({
      id: `service+${faker.string.uuid()}@example.test`,
      accessToken: faker.string.uuid(),
    });
    const api = new SimApi();
    api.operation(
      "POST",
      "/v1/projects/-/serviceAccounts/:email:generateAccessToken",
      ({ params }) => {
        return Response.json({
          accessToken: accounts.get(requirePathParameter(params, "email"))
            .accessToken,
        });
      },
    );
    const origin = `https://${faker.internet.domainName()}`;
    using environment = new SimEnvironment();
    environment.register(origin, api);

    // When application code borrows a token for a percent-encoded account.
    const response = await fetch(
      `${origin}/v1/projects/-/serviceAccounts/${encodeURIComponent(account.id)}:generateAccessToken`,
      { method: "POST" },
    );

    // Then the account identity reaches the handler without the method suffix.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), {
      accessToken: account.accessToken,
    });
  });

  it.each([
    "account",
    "part:account",
    "part%3Aaccount",
    "part%2Faccount",
    "%E4%B8%AD%E6%96%87",
    "part%252Faccount",
  ])(
    "captures the complete identifier in %s:generateAccessToken",
    async (identity) => {
      // Given a custom method with a parameter before its literal suffix.
      const api = new SimApi();
      api.operation(
        "POST",
        "/accounts/:email:generateAccessToken",
        ({ params }) => Response.json(params),
      );

      // When the identifier contains literal or encoded characters.
      const response = await api.handle(
        new Request(
          `https://api.example.test/accounts/${identity}:generateAccessToken`,
          { method: "POST" },
        ),
      );

      // Then the whole identifier is decoded once, as for a whole-segment parameter.
      assertObjectEquals(await response.json(), {
        email: decodeURIComponent(identity),
      });
    },
  );

  it.each([
    "account:generateIdToken",
    "account:generateAccessTokenExtra",
    "account:GenerateAccessToken",
    "account",
    ":generateAccessToken",
    "part/account:generateAccessToken",
    "%E0%A4%A:generateAccessToken",
    "account%3AgenerateAccessToken",
  ])("refuses the unmatched path %s", async (path) => {
    // Given one implemented custom method.
    const api = new SimApi({ name: "IAM Credentials" });
    api.operation("POST", "/accounts/:email:generateAccessToken", () =>
      Response.json({ accessToken: "borrowed" }),
    );
    const url = `https://api.example.test/accounts/${path}`;

    // When the suffix, segment boundary, identifier or encoding is invalid.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(new Request(url, { method: "POST" })),
    );

    // Then the request fails with the public unimplemented-route error.
    assertInstanceOf(error, UnimplementedRouteError);
    assertIdentical(
      error.message,
      `POST ${url} reached IAM Credentials, but IAM Credentials has no handler for POST /accounts/${path}.`,
    );
  });

  it.each([false, true])(
    "ranks literal, suffixed and whole-segment routes independently of registration order (reverse=%s)",
    async (reverse) => {
      // Given three overlapping routes registered in either order.
      const api = new SimApi();
      const paths = [
        "/accounts/:id",
        "/accounts/:email:generateAccessToken",
        "/accounts/special:generateAccessToken",
      ];
      for (const path of reverse ? paths.toReversed() : paths) {
        api.operation("POST", path, ({ params }) =>
          Response.json({ path, params }),
        );
      }

      // When requests match a literal route, a custom method and a general item.
      const literal = await api.handle(
        new Request(
          "https://api.example.test/accounts/special:generateAccessToken",
          { method: "POST" },
        ),
      );
      const custom = await api.handle(
        new Request(
          "https://api.example.test/accounts/ordinary:generateAccessToken",
          { method: "POST" },
        ),
      );
      const general = await api.handle(
        new Request(
          "https://api.example.test/accounts/ordinary:anotherMethod",
          { method: "POST" },
        ),
      );

      // Then each request selects its most specific route.
      assertObjectEquals(await literal.json(), { path: paths[2], params: {} });
      assertObjectEquals(await custom.json(), {
        path: paths[1],
        params: { email: "ordinary" },
      });
      assertObjectEquals(await general.json(), {
        path: paths[0],
        params: { id: "ordinary:anotherMethod" },
      });
    },
  );

  it("supports resource actions and configured built-in operations", async () => {
    // Given an archive action and an update operation with custom-method paths.
    const api = new SimApi();
    const widgets = api.resource<{ id: string; status: string }>({
      path: "/widgets",
      operations: { update: { method: "POST", path: "/:id:update" } },
    });
    const widget = widgets.seed({ id: faker.string.uuid(), status: "active" });
    widgets.operation("archive", {
      method: "POST",
      path: "/:id:archive",
      handle: ({ params, resource }) =>
        resource.update(requirePathParameter(params, "id"), {
          status: "archived",
        }),
    });

    // When both operations address the same entity through their suffixes.
    const archived = await api.handle(
      new Request(`https://api.example.test/widgets/${widget.id}:archive`, {
        method: "POST",
      }),
    );
    const updated = await api.handle(
      new Request(`https://api.example.test/widgets/${widget.id}:update`, {
        method: "POST",
        body: JSON.stringify({ status: "active" }),
        headers: { "content-type": "application/json" },
      }),
    );

    // Then resource identity and domain mutations use the captured ID.
    assertObjectEquals(await archived.json(), {
      id: widget.id,
      status: "archived",
    });
    assertObjectEquals(await updated.json(), {
      id: widget.id,
      status: "active",
    });
    assertIdentical(widgets.get(widget.id).status, "active");
  });

  it("matches suffixed parameters alongside whole-segment parameters", async () => {
    // Given multiple named parameters, including a suffix before another segment.
    const api = new SimApi();
    api.operation(
      "GET",
      "/projects/:project/accounts/:email:inspect/results/:result",
      ({ params }) => Response.json(params),
    );

    // When every parameter is supplied in the request path.
    const response = await api.handle(
      new Request(
        "https://api.example.test/projects/my-project/accounts/service%40example.test:inspect/results/latest",
      ),
    );

    // Then each parameter retains its own decoded value.
    assertObjectEquals(await response.json(), {
      project: "my-project",
      email: "service@example.test",
      result: "latest",
    });
  });

  it.each([":id:", ":id:verb:extra", ":9id:verb", ":id:9verb", ":id:bad-verb"])(
    "rejects the malformed parameter %s at registration",
    (segment) => {
      // Given a template with an invalid parameter name or method suffix.
      const api = new SimApi();

      // When the operation is defined.
      const error = assertThrowsError(() =>
        api.operation("POST", `/accounts/${segment}`, () => new Response()),
      );

      // Then the definition error identifies the malformed segment.
      assertInstanceOf(error, TypeError);
      assertIdentical(
        error.message,
        `Expected a named path parameter such as ":id", received "${segment}".`,
      );
    },
  );

  it.each(["/:id/:id:archive", "/:id:inspect/:id:archive"])(
    "rejects a repeated parameter name in %s",
    (path) => {
      // Given a template that uses one name more than once.
      const api = new SimApi();

      // When the operation is defined.
      const error = assertThrowsError(() =>
        api.operation("POST", path, () => new Response()),
      );

      // Then the suffix leaves duplicate-name validation intact.
      assertIdentical(
        error.message,
        'Path parameter ":id" appears more than once.',
      );
    },
  );
});
