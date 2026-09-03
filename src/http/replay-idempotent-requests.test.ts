import { faker } from "@faker-js/faker";
import {
  assertBufferEqual,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  IdempotencyKeyReusedError,
  replayIdempotentRequests,
  SimApi,
} from "../index.js";

describe("replaying idempotent HTTP requests", () => {
  const request = (
    url: string,
    key: string | undefined,
    options: {
      body?: string;
      headers?: Record<string, string>;
      method?: string;
    } = {},
  ): Request => {
    const headers = new Headers(options.headers);

    if (key !== undefined) {
      headers.set("Idempotency-Key", key);
    }

    return new Request(url, {
      ...(options.body === undefined ? {} : { body: options.body }),
      headers,
      method: options.method ?? "POST",
    });
  };

  it("replays the first response with its status, body and headers", async () => {
    // Given an operation whose later answer would expose a duplicate execution.
    const api = new SimApi();
    const key = faker.string.uuid();
    const url = "https://api.example.test/charges";
    const requestBody = JSON.stringify({ amount: faker.number.int() });
    const responseBody = faker.string.alpha({ length: 64 });
    const answerId = faker.string.uuid();
    let available = true;
    api.use(replayIdempotentRequests());
    api.use(async (_context, next) => {
      const response = await next();
      response.headers.set("x-api-version", "2026-09-03");
      return response;
    });
    api.operation("POST", "/charges", async ({ request: received }) => {
      const receivedBody = await received.text();

      if (!available) {
        return new Response("duplicate execution", { status: 503 });
      }

      available = false;
      return new Response(
        new TextEncoder().encode(`${receivedBody}:${responseBody}`),
        {
          headers: {
            "content-language": "en-GB",
            "content-type": "application/octet-stream",
            "x-answer-id": answerId,
          },
          status: 201,
          statusText: "Created by simulation",
        },
      );
    });

    // When the completed request is repeated with the same key.
    const first = await api.handle(request(url, key, { body: requestBody }));
    const replayed = await api.handle(request(url, key, { body: requestBody }));

    // Then the second response is a complete copy of the first response.
    assertResponseStatus(first, 201);
    assertResponseStatus(replayed, 201);
    assertIdentical(replayed.statusText, "Created by simulation");
    assertIdentical(replayed.headers.get("x-api-version"), "2026-09-03");
    assertObjectEquals(
      [...replayed.headers.entries()],
      [...first.headers.entries()],
    );
    assertBufferEqual(
      new Uint8Array(await replayed.arrayBuffer()),
      new Uint8Array(await first.arrayBuffer()),
    );
  });

  it("refuses a key reused across a method, path, query or body", async () => {
    // Given a completed request and operations for every comparison case.
    const api = new SimApi();
    const key = faker.string.uuid();
    const baseUrl = "https://api.example.test/charges?currency=gbp";
    api.use(replayIdempotentRequests());
    api.operation("POST", "/charges", () => new Response("created"));
    api.operation("PATCH", "/charges", () => new Response("updated"));
    api.operation("POST", "/refunds", () => new Response("refunded"));
    await api.handle(request(baseUrl, key, { body: "amount=100" }));

    // When the key is reused with one different part of the request.
    const method = await api.handle(
      request(baseUrl, key, { body: "amount=100", method: "PATCH" }),
    );
    const path = await api.handle(
      request("https://api.example.test/refunds?currency=gbp", key, {
        body: "amount=100",
      }),
    );
    const query = await api.handle(
      request("https://api.example.test/charges?currency=usd", key, {
        body: "amount=100",
      }),
    );
    const body = await api.handle(
      request(baseUrl, key, { body: "amount=200" }),
    );
    const bodyLength = await api.handle(
      request(baseUrl, key, { body: "amount=20000" }),
    );

    // Then every reuse gets the supplied mismatch response.
    const mismatchBodies = await Promise.all(
      [method, path, query, body, bodyLength].map(async (response) => {
        assertResponseStatus(response, 422);
        return response.json();
      }),
    );
    for (const mismatchBody of mismatchBodies) {
      assertObjectEquals(mismatchBody, {
        error: `Idempotency-Key value "${key}" has already been used for a different request.`,
      });
    }
  });

  it("lets the API error formatter shape a key reuse error", async () => {
    // Given a service formatter with its own idempotency error envelope.
    const key = faker.string.uuid();
    let reuseError: unknown;
    const api = new SimApi({
      formatError(error) {
        if (!(error instanceof IdempotencyKeyReusedError)) {
          return undefined;
        }

        reuseError = error;
        return Response.json(
          { error: { message: error.message, type: "idempotency_error" } },
          { status: 400 },
        );
      },
    });
    api.use(replayIdempotentRequests());
    api.operation("POST", "/charges", () => new Response("created"));
    await api.handle(
      request("https://api.example.test/charges", key, { body: "amount=100" }),
    );

    // When the key is reused with a different body.
    const response = await api.handle(
      request("https://api.example.test/charges", key, { body: "amount=200" }),
    );

    // Then the formatter receives the typed error and supplies the response.
    assertInstanceOf(reuseError, IdempotencyKeyReusedError);
    assertIdentical(reuseError.key, key);
    assertIdentical(reuseError.headerName, "Idempotency-Key");
    assertResponseStatus(response, 400);
    assertObjectEquals(await response.json(), {
      error: {
        message: reuseError.message,
        type: "idempotency_error",
      },
    });
  });

  it("ignores the origin and headers outside the configured key", async () => {
    // Given a completed request carrying an origin and service-specific header.
    const api = new SimApi();
    const key = faker.string.uuid();
    const url = "https://api.example.test/charges";
    api.use(replayIdempotentRequests());
    api.operation("POST", "/charges", ({ request: received }) =>
      Response.json({ version: received.headers.get("x-api-version") }),
    );
    await api.handle(
      request(url, key, {
        headers: { "x-api-version": "2025-01-01" },
      }),
    );

    // When the same request and key carry a changed non-key header.
    const response = await api.handle(
      request("https://regional.example.test/charges", key, {
        headers: { "x-api-version": "2026-01-01" },
      }),
    );

    // Then the first response is replayed.
    assertResponseStatus(response, 200);
    assertObjectEquals(await response.json(), { version: "2025-01-01" });
  });

  it("reads a configured key header", async () => {
    // Given middleware configured for a service-specific header name.
    const api = new SimApi();
    const key = faker.string.uuid();
    const url = "https://api.example.test/payments";
    api.use(replayIdempotentRequests({ headerName: "PayPal-Request-Id" }));
    api.operation("POST", "/payments", () =>
      Response.json({ answer: faker.string.uuid() }),
    );
    const keyed = (idempotencyKey: string): Request =>
      request(url, undefined, {
        headers: { "PayPal-Request-Id": idempotencyKey },
      });

    // When the configured key is repeated.
    const first = await api.handle(keyed(key));
    const replayed = await api.handle(keyed(key));

    // Then it replays the answer under that key.
    const firstBody = (await first.json()) as { answer: string };
    assertObjectEquals(await replayed.json(), firstBody);
  });

  it("passes requests without the configured middleware and key", async () => {
    // Given one API with replay middleware and one without it.
    const withMiddleware = new SimApi();
    const withoutMiddleware = new SimApi();
    const operation = () => Response.json({ answer: faker.string.uuid() });
    withMiddleware.use(replayIdempotentRequests());
    withMiddleware.operation("POST", "/charges", operation);
    withoutMiddleware.operation("POST", "/charges", operation);
    const url = "https://api.example.test/charges";
    const unconfiguredKey = faker.string.uuid();

    // When each API handles two requests outside configured replay.
    const unkeyedFirst = await withMiddleware.handle(request(url, undefined));
    const unkeyedSecond = await withMiddleware.handle(request(url, undefined));
    const plainFirst = await withoutMiddleware.handle(
      request(url, unconfiguredKey),
    );
    const plainSecond = await withoutMiddleware.handle(
      request(url, unconfiguredKey),
    );

    // Then each request runs normally and receives a fresh answer.
    const unkeyedFirstBody = (await unkeyedFirst.json()) as { answer: string };
    const unkeyedSecondBody = (await unkeyedSecond.json()) as {
      answer: string;
    };
    const plainFirstBody = (await plainFirst.json()) as { answer: string };
    const plainSecondBody = (await plainSecond.json()) as { answer: string };
    assertFalse(unkeyedFirstBody.answer === unkeyedSecondBody.answer);
    assertFalse(plainFirstBody.answer === plainSecondBody.answer);
  });
});
