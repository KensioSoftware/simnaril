import { faker } from "@faker-js/faker";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertResponseStatus,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimEnvironment,
  type SimService,
  SimWebhooks,
  UnclaimedOriginError,
} from "./index.js";

describe("sending requests outwards", () => {
  /** The application under test, standing in for what receives the hooks. */
  class Receiver implements SimService {
    readonly received: { body: string; method: string; signature: string }[] =
      [];
    readonly #status: number;

    constructor(status = 200) {
      this.#status = status;
    }

    async handle(request: Request): Promise<Response> {
      this.received.push({
        body: await request.text(),
        method: request.method,
        signature: request.headers.get("x-signature") ?? "",
      });

      return new Response(undefined, { status: this.#status });
    }
  }

  const origin = (): string => `https://${faker.internet.domainName()}`;

  it("holds a delivery until the queue is flushed", async () => {
    // Given an enqueued delivery and a receiver that has heard nothing.
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, receiver);
    const webhooks = new SimWebhooks();
    const body = faker.string.uuid();
    webhooks.enqueue({ body, url: `${site}/hooks` });

    // Then nothing has gone out, and the delivery is waiting.
    assertArrayLength(webhooks.pending, 1);
    assertArrayEmpty(receiver.received);

    // When the queue is flushed.
    const results = await webhooks.flush();

    // Then the receiver was posted to, and the queue is empty again.
    assertObjectEquals(receiver.received, [
      { body, method: "POST", signature: "" },
    ]);
    assertArrayLength(results, 1);
    assertIdentical(results[0].response?.status, 200);
    assertArrayEmpty(webhooks.pending);
  });

  it("sends headers and method the service chose", async () => {
    // Given a delivery carrying a signature the service built.
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, receiver);
    const webhooks = new SimWebhooks();
    const signature = faker.string.alphanumeric(32);
    webhooks.enqueue({
      body: "{}",
      headers: { "x-signature": signature },
      method: "PUT",
      url: `${site}/hooks`,
    });

    // When the queue is flushed.
    await webhooks.flush();

    // Then the receiver saw both.
    assertObjectEquals(receiver.received, [
      { body: "{}", method: "PUT", signature },
    ]);
  });

  it("sends in the order the deliveries were enqueued", async () => {
    // Given three deliveries queued in a known order.
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, receiver);
    const webhooks = new SimWebhooks();
    const bodies = ["first", "second", "third"];

    for (const body of bodies) {
      webhooks.enqueue({ body, url: `${site}/hooks` });
    }

    // When the queue is flushed.
    await webhooks.flush();

    // Then the receiver saw them in that order.
    assertObjectEquals(
      receiver.received.map((one) => one.body),
      bodies,
    );
  });

  it("reports what each endpoint answered", async () => {
    // Given a receiver that refuses the delivery.
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, new Receiver(400));
    const webhooks = new SimWebhooks();
    webhooks.enqueue({ body: "{}", url: `${site}/hooks` });

    // When the queue is flushed.
    const [result] = await webhooks.flush();

    // Then the delivery arrived, and the response says what happened to it.
    assertTrue(result?.delivered);
    assertResponseStatus(result.response, 400);
    assertUndefined(result.error);
  });

  it("reports a delivery no simulation claimed", async () => {
    // Given a delivery addressed at an origin outside every simulation.
    using environment = new SimEnvironment();
    environment.register(origin(), new Receiver());
    const webhooks = new SimWebhooks();
    const unclaimed = `${origin()}/hooks`;
    webhooks.enqueue({ body: "{}", url: unclaimed });

    // When the queue is flushed.
    const [result] = await webhooks.flush();

    // Then it comes back as a failure naming the unclaimed origin.
    assertFalse(result?.delivered);
    assertUndefined(result.response);
    assertInstanceOf(result.error, TypeError);
    assertInstanceOf(result.error.cause, UnclaimedOriginError);
  });

  it("sends nothing on a second flush, having emptied the queue", async () => {
    // Given a delivery that has already gone out once.
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, receiver);
    const webhooks = new SimWebhooks();
    webhooks.enqueue({ body: "{}", url: `${site}/hooks` });
    await webhooks.flush();

    // When the queue is flushed again with nothing added to it.
    const second = await webhooks.flush();

    // Then nothing went out a second time. Redelivering takes enqueueing it
    // again, which is what the documented behaviour turns on.
    assertArrayEmpty(second);
    assertArrayLength(receiver.received, 1);
  });

  it("delivers without a flush when the queue is a background one", async () => {
    // Given a background queue and a receiver that says when it was reached.
    let arrived: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, {
      handle: async (request): Promise<Response> => {
        const response = await receiver.handle(request);

        arrived();

        return response;
      },
    });
    const webhooks = new SimWebhooks({ deliver: "background" });

    // When a delivery is enqueued and nothing flushes it.
    webhooks.enqueue({ body: "unattended", url: `${site}/hooks` });
    await reached;

    // Then it went out on its own, and nothing was ever waiting.
    assertArrayLength(receiver.received, 1);
    assertArrayEmpty(webhooks.pending);
  });

  it("waits for the background to go quiet when flushed", async () => {
    // Given a background queue with three deliveries under way.
    const receiver = new Receiver();
    using environment = new SimEnvironment();
    const site = origin();
    environment.register(site, receiver);
    const webhooks = new SimWebhooks({ deliver: "background" });
    const bodies = ["first", "second", "third"];

    for (const body of bodies) {
      webhooks.enqueue({ body, url: `${site}/hooks` });
    }

    // When the queue is flushed.
    const results = await webhooks.flush();

    // Then every one had landed by the time it answered, in order.
    assertArrayLength(results, 3);
    assertObjectEquals(
      receiver.received.map((one) => one.body),
      bodies,
    );
    assertIdentical(results[0].response?.status, 200);
  });

  it("waits for work a receiver enqueues in the background", async () => {
    // Given a background queue whose receiver enqueues one more, which is what
    // a service reacting to its own hook does.
    const site = origin();
    const webhooks = new SimWebhooks({ deliver: "background" });
    let handled = 0;
    using environment = new SimEnvironment();
    environment.register(site, {
      handle: (): Response => {
        handled += 1;

        if (handled === 1) {
          webhooks.enqueue({ body: "second", url: `${site}/hooks` });
        }

        return new Response(undefined, { status: 200 });
      },
    });
    webhooks.enqueue({ body: "first", url: `${site}/hooks` });

    // When the queue is flushed once.
    const results = await webhooks.flush();

    // Then the delivery the receiver set off was waited for too, which is what
    // separates a background queue from a flush.
    assertArrayLength(results, 2);
    assertIdentical(handled, 2);
  });

  it("leaves work a receiver enqueues for the next flush", async () => {
    // Given a receiver that enqueues a second delivery while handling the
    // first, which is what a service reacting to its own hook does.
    const webhooks = new SimWebhooks();
    const site = origin();
    let handled = 0;
    using environment = new SimEnvironment();
    environment.register(site, {
      handle: (): Response => {
        handled += 1;

        if (handled === 1) {
          webhooks.enqueue({ body: "second", url: `${site}/hooks` });
        }

        return new Response(undefined, { status: 200 });
      },
    });
    webhooks.enqueue({ body: "first", url: `${site}/hooks` });

    // When the queue is flushed once.
    const first = await webhooks.flush();

    // Then only the first went, and the second is waiting for the next flush.
    assertArrayLength(first, 1);
    assertArrayLength(webhooks.pending, 1);
    assertIdentical(handled, 1);

    // When it is flushed again.
    const second = await webhooks.flush();

    // Then the second went too.
    assertArrayLength(second, 1);
    assertIdentical(handled, 2);
    assertArrayEmpty(webhooks.pending);
  });
});
