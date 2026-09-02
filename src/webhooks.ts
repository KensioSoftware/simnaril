/**
 * When a queue sends what it is given.
 *
 * `manual` holds every delivery until `flush` asks for it. The test decides
 * when the hook goes out, and that is where a reader looks for the moment it
 * did.
 *
 * `background` starts each delivery as it is enqueued, the way a real provider
 * posts one without being asked. `flush` then waits for the last one to land.
 */
export type WebhookDeliveryTiming = "manual" | "background";

/** Configures one outbound queue. */
export interface SimWebhooksProps {
  /** When deliveries go out. `manual` when none is given. */
  readonly deliver?: WebhookDeliveryTiming;
}

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
  readonly #sending: Promise<WebhookDeliveryResult>[] = [];
  readonly #background: boolean;
  /** The delivery each new background one queues up behind. */
  #last: Promise<unknown> = Promise.resolve();

  constructor(props: SimWebhooksProps = {}) {
    this.#background = props.deliver === "background";
  }

  /**
   * Holds one request, or starts it, depending on when this queue delivers.
   *
   * A background delivery goes out behind the one before it. Deliveries are in
   * order in both timings, and the timing decides when rather than what.
   */
  enqueue(delivery: WebhookDelivery): void {
    if (!this.#background) {
      this.#queued.push(delivery);

      return;
    }

    const sending = this.#last.then(() => send(delivery));

    this.#last = sending;
    this.#sending.push(sending);
  }

  /**
   * What is waiting for the next flush, in the order it was enqueued.
   *
   * Always empty on a background queue, where nothing waits.
   */
  get pending(): readonly WebhookDelivery[] {
    return [...this.#queued];
  }

  /**
   * Answers once everything enqueued so far has been delivered, with what each
   * endpoint did.
   *
   * On the default queue this is what sends them. On a background queue they
   * are already going, and this waits for the last one to land, the way
   * Yulin's `backgroundTasksComplete()` does for a simulated AWS account.
   *
   * A result carries a `response` or an `error`, and the two mean different
   * things. An endpoint that answered, including one answering 400 or 500, is
   * a `response` to read the status off. `error` is for a delivery that never
   * arrived at all, such as an unreachable host or an origin no simulation
   * claims. A simulation exists to reproduce both, so neither throws.
   */
  async flush(): Promise<WebhookDeliveryResult[]> {
    return this.#background ? this.#settled() : this.#sendQueued();
  }

  /**
   * Sends what is waiting.
   *
   * The queue is emptied before the first request goes out, so a receiver that
   * enqueues more work leaves it for the next flush in place of extending this
   * one. Holding a queue is for deciding when deliveries go, and a flush that
   * chased its own tail would take that decision back.
   */
  async #sendQueued(): Promise<WebhookDeliveryResult[]> {
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

  /**
   * Waits for the background to go quiet.
   *
   * A delivery a receiver enqueues while this is waiting has already started,
   * so it is waited for too. That is the difference from a flush, and it is
   * the point of a background queue: the test asks once, and everything the
   * hooks set off has finished by the time it answers.
   */
  async #settled(): Promise<WebhookDeliveryResult[]> {
    const results: WebhookDeliveryResult[] = [];

    while (this.#sending.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- each round may add more
      results.push(...(await Promise.all(this.#sending.splice(0))));
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
