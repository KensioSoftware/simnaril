import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { EntityNotFoundError, type ErrorFormatter, SimApi } from "../index.js";

describe("shaping the errors one API answers with", () => {
  interface Widget {
    id: string;
    name: string;
  }

  /** A payment error the simulated service raises on its own behalf. */
  class CardDeclinedError extends Error {}

  /** The envelope a Stripe-shaped service answers every error with. */
  const stripeShaped: ErrorFormatter = (error) => {
    if (error instanceof CardDeclinedError) {
      return Response.json(
        { error: { code: "card_declined", type: "card_error" } },
        { status: 402 },
      );
    }

    if (error instanceof EntityNotFoundError) {
      return Response.json(
        { error: { message: error.message, type: "invalid_request_error" } },
        { status: 404 },
      );
    }

    return undefined;
  };

  const get = (path: string): Request =>
    new Request(`https://api.example.test${path}`);

  it("answers with the envelope the API describes", async () => {
    // Given an API whose errors are shaped by its own formatter.
    const api = new SimApi({ formatError: stripeShaped });
    const widgets = api.resource<Widget>({ path: "/widgets" });
    widgets.operation("charge", {
      method: "GET",
      path: "/:id/charge",
      handle: () => {
        throw new CardDeclinedError("Your card was declined.");
      },
    });
    widgets.seed({ id: "widget-1", name: faker.commerce.productName() });

    // When an operation raises an error that formatter knows.
    const response = await api.handle(get("/widgets/widget-1/charge"));

    // Then the response is the one the formatter built.
    assertResponseStatus(response, 402);
    assertObjectEquals(await response.json(), {
      error: { code: "card_declined", type: "card_error" },
    });
  });

  it("shapes the supplied state errors too", async () => {
    // Given an API with a formatter, and a request for an entity it lacks.
    const api = new SimApi({ formatError: stripeShaped });
    api.resource<Widget>({ path: "/widgets" });

    // When the missing entity raises EntityNotFoundError.
    const response = await api.handle(get("/widgets/missing"));

    // Then the formatter shaped it, in place of the supplied `{ error }` body.
    assertResponseStatus(response, 404);
    const body = (await response.json()) as { error: { type: string } };
    assertIdentical(body.error.type, "invalid_request_error");
  });

  it("leaves a declined error to the supplied mappings", async () => {
    // Given a formatter that shapes nothing at all.
    const api = new SimApi({ formatError: () => undefined });
    api.resource<Widget>({ path: "/widgets" });

    // When a request raises one of the mapped state errors.
    const response = await api.handle(get("/widgets/missing"));

    // Then the supplied mapping answered it.
    assertResponseStatus(response, 404);
    assertObjectEquals(await response.json(), {
      error: 'No entity exists with identity "missing".',
    });
  });

  it("keeps an unshaped error loud", async () => {
    // Given a formatter that declines, and an operation raising its own error.
    const api = new SimApi({ formatError: () => undefined });
    const widgets = api.resource<Widget>({ path: "/widgets" });
    widgets.operation("charge", {
      method: "GET",
      path: "/:id/charge",
      handle: () => {
        throw new CardDeclinedError("Your card was declined.");
      },
    });

    // When the request is handled.
    const error = await assertThrowsErrorAsync(() =>
      api.handle(get("/widgets/widget-1/charge")),
    );

    // Then it escapes as it always has, in place of becoming a 500.
    assertInstanceOf(error, CardDeclinedError);
  });
});
