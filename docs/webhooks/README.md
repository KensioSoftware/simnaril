# Webhooks

`SimWebhooks` is a queue of requests a simulated service sends outwards. It is the direction the
rest of Simnaril lacks. A service that calls back into the application under test, the way Stripe
posts an event or GitHub posts a push, holds the call here until a test asks for it to go.

## Enqueue and flush

```ts
import { SimWebhooks } from "@kensio/simnaril";

const webhooks = new SimWebhooks();

webhooks.enqueue({
  body: JSON.stringify({ type: "checkout.session.completed" }),
  headers: { "stripe-signature": signature },
  url: "https://shop.example.com/hooks/stripe",
});

const results = await webhooks.flush();
```

`enqueue` holds one request. `flush` sends everything waiting, in the order it was enqueued, and
answers with what each endpoint did. `pending` reads the queue without sending it.

`method` defaults to `POST`. `body` is the exact string the endpoint receives, which is what a
signature is computed over.

## Choose when deliveries go

A queue delivers on a flush by default. The test decides when the hook goes out, and the flush is
where a reader looks for the moment it did.

```ts
const webhooks = new SimWebhooks({ deliver: "background" });
```

A background queue starts each delivery as it is enqueued, the way a real provider posts one without
being asked. `flush` then waits for the last one to land, which is what
`simAws.backgroundTasksComplete()` does for a simulated AWS account in
[Yulin](https://www.npmjs.com/package/@kensio/yulin).

|                            | `manual` (default)       | `background`              |
| -------------------------- | ------------------------ | ------------------------- |
| A delivery goes out        | on `flush`               | as it is enqueued         |
| `flush` answers            | once it has sent them    | once they have landed     |
| `pending`                  | what is waiting          | always empty              |
| A hook a receiver enqueues | waits for the next flush | is waited for by this one |

Deliveries go one at a time and in order either way. The timing decides when, and not what.

The last row is the real difference. A background queue is asked once and everything the hooks set
off has finished by the time it answers, cascades included. A flush sends the batch it was given and
leaves anything that batch caused for the next one, because holding a queue is for deciding when
deliveries go and a flush that chased its own tail would take that decision back.

## Delivery goes through the environment

`flush` sends an ordinary `fetch`. A live `SimEnvironment` routes it by origin like any other
request, and registering the application's own origin as a `SimService` keeps the whole round trip
inside the process.

```ts
using environment = new SimEnvironment();

environment.register("https://api.stripe.com", stripe);
environment.register("https://shop.example.com", {
  handle: (request) => shop.fetch(request),
});
```

A test then arranges, delivers and asserts in three lines the reader can see in order.

```ts
stripe.pay(sessionId);
await webhooks.flush();

const order = await shop.fetch(orderUrl);
```

## Reading the results

Each result names its delivery and says whether it arrived.

```ts
const [result] = await webhooks.flush();

console.log(result?.response?.status);
console.log(result?.error);
```

`response` and `error` mean different things, and only one of them is ever set.

| The delivery                              | Result                                   |
| ----------------------------------------- | ---------------------------------------- |
| Reached an endpoint, whatever it answered | `response`, including for a 400 or a 500 |
| Never arrived                             | `error`, and no `response`               |

An endpoint answering 400 is an endpoint that answered. Read the status off `response`. `error` is
for a delivery that got nowhere, such as an unreachable host, or an origin no simulation claims
carrying `UnclaimedOriginError`. A simulation exists to reproduce both, so neither throws.

## What it leaves out

Signing belongs to the service. Stripe's own SDK has `webhooks.generateTestHeaderString`, and a
signature built anywhere else would be a second implementation to keep in step with the first.
Build the header and pass it in `headers`.

There are no retries, no backoff and no schedule. `flush` empties the queue as it goes, so a test
that wants the same hook delivered twice enqueues it twice.

There is no delay, and no simulated clock. A background delivery starts on the next turn of the
event loop, and a test that wants to observe one without flushing waits on something its own
receiver resolves.

The queue is emptied before the first request goes out. A receiver that enqueues more work leaves
it for the next flush, and a service reacting to its own hook cannot spin one flush forever.
