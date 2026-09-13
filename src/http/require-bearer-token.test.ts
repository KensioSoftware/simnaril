import { faker } from "@faker-js/faker";
import { DynamicFactory } from "@kensio/part-factory";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  BearerTokenError,
  replayIdempotentRequests,
  requireBearerToken,
  SimApi,
  SimEnvironment,
  UnimplementedRouteError,
  type RequireBearerTokenProps,
} from "../index.js";

describe("requiring a bearer token", () => {
  interface Customer {
    id: string;
    email: string;
  }
  const customerFactory = new DynamicFactory<Customer>(() => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),
  }));

  it.each(["Bearer", "bearer", "BEARER", "bEaReR"])(
    "accepts the expected token with the %s scheme",
    async (scheme) => {
      // Given a customer API protected by a token with every permitted character kind.
      const token = `AbZ09-._~+/${faker.string.uuid()}==`;
      const api = new SimApi();
      const props: RequireBearerTokenProps = { token };
      api.use(requireBearerToken(props));
      const customers = api.resource<Customer>({ path: "/customers" });
      const customer = customerFactory.make();
      const origin = `https://${faker.internet.domainName()}`;
      using environment = new SimEnvironment();
      environment.register(origin, api);

      // When ordinary application code creates a customer with valid credentials.
      const response = await fetch(`${origin}/customers`, {
        method: "POST",
        headers: {
          Authorization: `${scheme} ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(customer),
      });

      // Then the request body reaches the operation and the new customer persists.
      assertResponseStatus(response, 201);
      assertObjectEquals(await response.json(), customer);
      assertObjectEquals(customers.get(customer.id), customer);
    },
  );

  it.each([
    {
      header: undefined,
      reason: "missing",
      message: "An Authorization header with a bearer token is required.",
    },
    {
      header: "Bearer another-token",
      reason: "mismatch",
      message: "The bearer token does not match the expected token.",
    },
    {
      header: "Bearer EXPECTED-TOKEN",
      reason: "mismatch",
      message: "The bearer token does not match the expected token.",
    },
    ...[
      "",
      "Bearer",
      "Bearer ",
      "Bearerexpected-token",
      "Basic expected-token",
      "Bearer\texpected-token",
      "Bearer \texpected-token",
      'Bearer "expected-token"',
      "Bearer expected-token extra",
      "Bearer expected-token, Bearer expected-token",
      "Bearer expected=token",
      "Bearer =",
      "Bearer expected-token;",
      "Bearer expected-token\u00A0",
      "Bearer expected-token\v",
      "Bearer expected-token\f",
      "Bearer expected%2Dtoken",
    ].map((header) => ({
      header,
      reason: "malformed",
      message: "Expected an Authorization header containing one bearer token.",
    })),
  ])(
    "refuses $header before the operation reads its body",
    async ({ header, message }) => {
      // Given a protected create operation and a request with invalid credentials.
      const api = new SimApi();
      api.use(requireBearerToken({ token: "expected-token" }));
      const customers = api.resource<Customer>({ path: "/customers" });
      const headers = new Headers({ "content-type": "application/json" });
      if (header !== undefined) {
        headers.set("Authorization", header);
      }
      const request = new Request("https://api.example.test/customers", {
        method: "POST",
        headers,
        body: "malformed JSON",
      });

      // When the request attempts to create a customer.
      const response = await api.handle(request);

      // Then authentication refuses it before decoding or changing resource state.
      assertResponseStatus(response, 401);
      assertObjectEquals(await response.json(), { error: message });
      assertIdentical(response.headers.get("www-authenticate"), "Bearer");
      assertFalse(request.bodyUsed);
      assertObjectEquals(customers.list(), []);
    },
  );

  it("accepts multiple spaces between scheme and token", async () => {
    // Given bearer credentials using the spacing allowed by RFC 6750.
    const token = faker.string.uuid();
    const api = new SimApi();
    api.use(requireBearerToken({ token }));
    api.operation("GET", "/account", () =>
      Response.json({ authenticated: true }),
    );

    // When the scheme and token have several ASCII spaces between them.
    const response = await api.handle(
      new Request("https://api.example.test/account", {
        headers: { authorization: `Bearer   ${token}` },
      }),
    );

    // Then the valid credentials reach the operation.
    assertObjectEquals(await response.json(), { authenticated: true });
  });

  it("checks the normalized header value supplied by Request", async () => {
    // Given outer HTTP whitespace that Headers strips during construction.
    const token = faker.string.uuid();
    const api = new SimApi();
    api.use(requireBearerToken({ token }));
    api.operation("GET", "/account", () =>
      Response.json({ authenticated: true }),
    );
    const request = new Request("https://api.example.test/account", {
      headers: { authorization: ` \tBearer ${token} \t` },
    });

    // When the middleware receives the already-normalized request.
    const response = await api.handle(request);

    // Then the header value contains only the scheme, separator and token.
    assertIdentical(request.headers.get("authorization"), `Bearer ${token}`);
    assertObjectEquals(await response.json(), { authenticated: true });
  });

  it("refuses duplicate Authorization headers", async () => {
    // Given two otherwise valid credentials combined by Headers.
    const token = faker.string.uuid();
    const api = new SimApi();
    api.use(requireBearerToken({ token }));
    const customers = api.resource<Customer>({ path: "/customers" });
    const customer = customerFactory.make();
    const headers = new Headers([
      ["authorization", `Bearer ${token}`],
      ["Authorization", `Bearer ${token}`],
    ]);

    // When the request presents both values.
    const response = await api.handle(
      new Request("https://api.example.test/customers", {
        method: "POST",
        headers,
        body: JSON.stringify(customer),
      }),
    );

    // Then the combined credentials are refused and state stays empty.
    assertResponseStatus(response, 401);
    assertObjectEquals(customers.list(), []);
  });

  it.each(["", "has space", "bad=padding", "non-ascii-é"])(
    "refuses malformed credentials even if configured with token %s",
    async (token) => {
      // Given an expected token outside the bearer credential grammar.
      const api = new SimApi();
      api.use(requireBearerToken({ token }));
      api.resource<Customer>({ path: "/customers" });

      // When the request carries the same malformed token.
      const response = await api.handle(
        new Request("https://api.example.test/customers", {
          headers: { authorization: `Bearer ${token}` },
        }),
      );

      // Then equality alone cannot authorize the request.
      assertResponseStatus(response, 401);
    },
  );

  it.each([
    { header: undefined, reason: "missing" },
    { header: "Basic wrong", reason: "malformed" },
    { header: "Bearer wrong", reason: "mismatch" },
  ])(
    "lets a middleware formatter shape a $reason refusal",
    async ({ header, reason }) => {
      // Given an API whose bearer refusals use a Google-shaped error envelope.
      const api = new SimApi();
      api.use(
        requireBearerToken({
          token: faker.string.uuid(),
          formatError: (error) => {
            assertInstanceOf(error, BearerTokenError);
            return Response.json(
              {
                error: {
                  code: 403,
                  status: "UNAUTHENTICATED",
                  reason: error.reason,
                },
              },
              { status: 403, headers: { "x-auth-error": error.name } },
            );
          },
        }),
      );
      api.resource<Customer>({ path: "/customers" });

      // When credentials are missing, malformed or different from the expected token.
      const response = await api.handle(
        new Request("https://api.example.test/customers", {
          headers: header === undefined ? {} : { authorization: header },
        }),
      );

      // Then the formatter controls the status, headers and body.
      assertResponseStatus(response, 403);
      assertIdentical(response.headers.get("x-auth-error"), "BearerTokenError");
      assertObjectEquals(await response.json(), {
        error: { code: 403, status: "UNAUTHENTICATED", reason },
      });
    },
  );

  it.each([false, true])(
    "uses API error handling when the middleware formatter declines (custom API formatter=%s)",
    async (customFormat) => {
      // Given a middleware formatter that leaves the refusal to the API.
      const api = new SimApi({
        formatError: (error) => {
          assertInstanceOf(error, BearerTokenError);
          return customFormat
            ? Response.json({ reason: error.reason }, { status: 403 })
            : undefined;
        },
      });
      api.use(
        requireBearerToken({
          token: faker.string.uuid(),
          formatError: () => undefined,
        }),
      );
      api.resource<Customer>({ path: "/customers" });

      // When the client omits its credentials.
      const response = await api.handle(
        new Request("https://api.example.test/customers"),
      );

      // Then API formatting or the supplied 401 response applies.
      assertResponseStatus(response, customFormat ? 403 : 401);
      assertObjectEquals(
        await response.json(),
        customFormat
          ? { reason: "missing" }
          : {
              error: "An Authorization header with a bearer token is required.",
            },
      );
    },
  );

  it("keeps expected tokens separate for different APIs", async () => {
    // Given two APIs requiring different tokens in the same process.
    const first = new SimApi();
    const second = new SimApi();
    const firstToken = faker.string.uuid();
    const secondToken = faker.string.uuid();
    first.use(requireBearerToken({ token: firstToken }));
    second.use(requireBearerToken({ token: secondToken }));
    first.resource<Customer>({ path: "/customers" });
    second.resource<Customer>({ path: "/customers" });

    // When each API receives its own token and the other API's token.
    const request = (token: string) =>
      new Request("https://api.example.test/customers", {
        headers: { authorization: `Bearer ${token}` },
      });
    const firstAccepted = await first.handle(request(firstToken));
    const firstRefused = await first.handle(request(secondToken));
    const secondAccepted = await second.handle(request(secondToken));
    const secondRefused = await second.handle(request(firstToken));

    // Then a token is accepted only by its intended API.
    assertResponseStatus(firstAccepted, 200);
    assertResponseStatus(secondAccepted, 200);
    assertResponseStatus(firstRefused, 401);
    assertResponseStatus(secondRefused, 401);
  });

  it.each(["resource", "operation"])(
    "supports %s middleware scope",
    async (scope) => {
      // Given a token check scoped below the API.
      const api = new SimApi();
      const customers = api.resource<Customer>({ path: "/customers" });
      api.operation("GET", "/health", () => new Response("ready"));
      const token = faker.string.uuid();
      const customer = customerFactory.make();
      const middleware = requireBearerToken({ token });
      if (scope === "resource") {
        customers.use(middleware);
      } else {
        customers.operations.create.use(middleware);
      }

      // When clients use a protected operation and an unrelated health route.
      const refused = await api.handle(
        new Request("https://api.example.test/customers", { method: "POST" }),
      );
      const accepted = await api.handle(
        new Request("https://api.example.test/customers", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(customer),
        }),
      );
      const health = await api.handle(
        new Request("https://api.example.test/health"),
      );

      // Then the scoped check protects customer creation and the health route stays public.
      assertResponseStatus(refused, 401);
      assertResponseStatus(accepted, 201);
      assertIdentical(await health.text(), "ready");
    },
  );

  it("checks credentials before replaying an authenticated response", async () => {
    // Given authentication registered before idempotency replay and a completed creation.
    const api = new SimApi();
    const token = faker.string.uuid();
    const key = faker.string.uuid();
    const customer = customerFactory.make();
    api.use(requireBearerToken({ token }));
    api.use(replayIdempotentRequests());
    const customers = api.resource<Customer>({ path: "/customers" });
    const request = (credential: string) =>
      new Request("https://api.example.test/customers", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential}`,
          "Idempotency-Key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify(customer),
      });
    await api.handle(request(token));
    customers.delete(customer.id);

    // When the same key is retried with wrong credentials and then with the correct token.
    const refused = await api.handle(request("wrong"));
    const replayed = await api.handle(request(token));

    // Then authentication runs on the retry and authorized replay retains the original response.
    assertResponseStatus(refused, 401);
    assertResponseStatus(replayed, 201);
    assertObjectEquals(await replayed.json(), customer);
    assertObjectEquals(customers.list(), []);
  });

  it("keeps unknown routes loud before authentication", async () => {
    // Given a protected API with no matching route.
    const api = new SimApi();
    api.use(requireBearerToken({ token: faker.string.uuid() }));

    // When the client requests an unimplemented operation without credentials.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(new Request("https://api.example.test/unknown")),
    );

    // Then the normal unmatched-route error is preserved.
    assertInstanceOf(error, UnimplementedRouteError);
  });
});
