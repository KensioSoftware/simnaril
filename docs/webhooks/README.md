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

The queue is emptied before the first request goes out. A receiver that enqueues more work leaves
it for the next flush, and a service reacting to its own hook cannot spin one flush forever.
