import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertResponseStatus,
} from "@kensio/smartass";
import { describe, expectTypeOf, it } from "vitest";

import {
  decodeForm,
  EntityNotFoundError,
  SimApi,
  SimEnvironment,
  SimWebhooks,
} from "./index.js";

/**
 * The shape a real simulation composes into, proved end to end.
 *
 * Each piece has its own suite. This one puts them together on the path a
 * payment provider takes, because that path is the reason all four exist and
 * nothing else exercises them at once.
 *
 * A form-encoded request goes out through ordinary `fetch`, interception routes
 * it by origin, the form decoder reads its bracketed nesting, an error carries
 * the service's own envelope, and the service posts a hook back to the
 * application inside the same process.
 */
describe("a simulation composed of every piece", () => {
  interface Session {
    amount_total: number;
    id: string;
    status: string;
  }

  interface Created {
    id: string;
    line_items?: { quantity: string; unit_amount: string }[];
  }

  const providerOrigin = `https://api.${faker.internet.domainName()}`;
  const applicationOrigin = `https://${faker.internet.domainName()}`;

  /** The payment provider, as a downstream project would compose it. */
  function createProvider(webhooks: SimWebhooks): {
    api: SimApi;
    pay: (id: string) => void;
  } {
    const api = new SimApi({
      decode: decodeForm,
      formatError: (error) =>
        error instanceof EntityNotFoundError
          ? Response.json(
              {
                error: {
                  message: error.message,
                  type: "invalid_request_error",
                },
              },
              { status: 404 },
            )
          : undefined,
    });

    const sessions = api.resource<Session, Created>({
      name: "session",
      path: "/v1/checkout/sessions",
      create: (input) => ({
        amount_total: totalOf(input),
        id: `cs_test_${faker.string.alphanumeric(10)}`,
        status: "open",
      }),
    });
    expectTypeOf<(input: Created) => Session>().toEqualTypeOf<
      typeof sessions.create
    >();
    expectTypeOf<(input: Created) => Session>().toEqualTypeOf<
      typeof sessions.state.create
    >();

    return {
      api,
      pay: (id) => {
        const paid = sessions.update(id, { status: "complete" });

        webhooks.enqueue({
          body: JSON.stringify({
            data: { object: paid },
            type: "checkout.session.completed",
          }),
          url: `${applicationOrigin}/hooks/payments`,
        });
      },
    };
  }

  /** Prices the decoded body, which arrives as strings and nothing else. */
  function totalOf(input: Created): number {
    return (input.line_items ?? []).reduce(
      (total, line) => total + Number(line.unit_amount) * Number(line.quantity),
      0,
    );
  }

  it("carries a form request in and a hook back out", async () => {
    // Given a provider and an application, each registered under its own
    // origin, and an application that records the hooks it receives.
    const settled: string[] = [];
    const webhooks = new SimWebhooks();
    const provider = createProvider(webhooks);
    using environment = new SimEnvironment();
    environment.register(providerOrigin, provider.api);
    environment.register(applicationOrigin, {
      handle: async (request): Promise<Response> => {
        const event = (await request.json()) as {
          data: { object: Session };
        };

        settled.push(event.data.object.id);

        return new Response(undefined, { status: 200 });
      },
    });

    // When the application creates a session the way an SDK would, with a
    // form-encoded body carrying bracketed nesting.
    const created = await fetch(`${providerOrigin}/v1/checkout/sessions`, {
      body: "line_items[0][unit_amount]=250&line_items[0][quantity]=2&line_items[1][unit_amount]=695&line_items[1][quantity]=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const session = (await created.json()) as Session;

    // Then the provider read the nesting and priced it.
    assertResponseStatus(created, 201);
    assertIdentical(session.amount_total, 1195);
    assertIdentical(session.status, "open");

    // When the session is paid and the queued hook is delivered.
    provider.pay(session.id);
    const results = await webhooks.flush();

    // Then the application received it, in this process, with no port bound.
    assertArrayLength(results, 1);
    assertIdentical(results[0].response?.status, 200);
    assertObjectEquals(settled, [session.id]);
  });

  it("answers a missing session in the provider's own envelope", async () => {
    // Given the same provider, and a session id it has never issued.
    const webhooks = new SimWebhooks();
    const provider = createProvider(webhooks);
    using environment = new SimEnvironment();
    environment.register(providerOrigin, provider.api);

    // When the application asks for it.
    const response = await fetch(
      `${providerOrigin}/v1/checkout/sessions/cs_test_missing`,
    );

    // Then the error carries the shape the provider describes, in place of
    // Simnaril's supplied `{ error: message }` body.
    assertResponseStatus(response, 404);
    const body = (await response.json()) as { error: { type: string } };
    assertIdentical(body.error.type, "invalid_request_error");
  });
});
