/** One request a simulated service is holding to send. */
export interface WebhookDelivery {
  readonly body: string;
  readonly headers?: Record<string, string>;
  /** `POST` when none is given. */
  readonly method?: string;
  readonly url: string;
}

/** What one endpoint did with one delivery. */
export interface WebhookDeliveryResult {
  readonly delivery: WebhookDelivery;
  /**
   * What stopped the request from arriving, or nothing when it arrived.
   *
   * An endpoint that answered 400 or 500 arrived. That is a `response`.
   */
  readonly error: unknown;
  /** The endpoint's answer, whatever its status, or nothing when it never arrived. */
  readonly response: Response | undefined;
}

/**
 * A queue of requests a simulated service sends outwards.
 *
 * The direction every other part of Simnaril lacks. A service that calls back
 * into the application under test, the way Stripe posts an event or GitHub
 * posts a push, holds the call here until a test asks for it to go.
 *
 * ```ts
 * stripe.pay(sessionId);
 * const [result] = await sim.webhooks.flush();
 * ```
 *
 * Delivery is an ordinary `fetch`, so a live `SimEnvironment` routes it by
 * origin like any other request. Registering the application's own origin as a
 * `SimService` keeps the round trip inside the process. An origin no simulation
 * claims never arrives, and comes back as a result whose `error` is
 * `UnclaimedOriginError`.
 *
 * Holding the queue rather than sending on the spot is what makes a test
 * readable. The arrangement, the delivery and the assertion are three lines the
 * reader can see in order. A test that wants the same hook delivered twice
 * enqueues it again, because `flush` empties the queue as it goes.
 *
 * Signing belongs to the service. Stripe's own SDK has
 * `webhooks.generateTestHeaderString`, and a signature built anywhere else
 * would be a second implementation to keep in step with the first.
 */
export class SimWebhooks {
  readonly #queued: WebhookDelivery[] = [];

  /** Holds one request to send when the queue is next flushed. */
  enqueue(delivery: WebhookDelivery): void {
    this.#queued.push(delivery);
  }

  /** What is waiting to go, in the order it was enqueued. */
  get pending(): readonly WebhookDelivery[] {
    return [...this.#queued];
  }

  /**
   * Sends everything waiting, in order, and answers with what each endpoint
   * did.
   *
   * The queue is emptied before the first request goes out, so a receiver that
   * enqueues more work leaves it for the next flush in place of extending this
   * one.
   *
   * A result carries a `response` or an `error`, and the two mean different
   * things. An endpoint that answered, including one answering 400 or 500, is
   * a `response` to read the status off. `error` is for a delivery that never
   * arrived at all, such as an unreachable host or an origin no simulation
   * claims. A simulation exists to reproduce both, so neither throws.
   */
  async flush(): Promise<WebhookDeliveryResult[]> {
    const sending = this.#queued.splice(0);
    const results: WebhookDeliveryResult[] = [];

    /*
     * One at a time on purpose. A receiver's state changes in the order the
     * deliveries were enqueued, and `Promise.all` would hand that order to the
     * event loop.
     */
    for (const delivery of sending) {
      // oxlint-disable-next-line no-await-in-loop -- see above
      results.push(await send(delivery));
    }

    return results;
  }
}

async function send(delivery: WebhookDelivery): Promise<WebhookDeliveryResult> {
  try {
    const response = await fetch(delivery.url, {
      body: delivery.body,
      headers: delivery.headers ?? {},
      method: delivery.method ?? "POST",
    });

    return { delivery, error: undefined, response };
  } catch (error) {
    return { delivery, error, response: undefined };
  }
}
