# Check a simulation against the real service

A fidelity check sends the same parameters through the consumer's HTTP code twice. The first call
reaches the simulation. The second reaches the vendor's test environment. Compare the fields that
the consumer depends on.

## Dispose before the real call

Dispose the `SimEnvironment` before sending the request to the real service. Origin registration
applies to the whole Node.js process. While an environment owns an origin, every request to that
origin reaches the simulation.

Leaving the environment active sends both requests to the simulation. The responses then agree and
the check passes without contacting the real service.

Run the calls in this order:

1. Register the simulation.
2. Send the simulated request.
3. Dispose the environment.
4. Send the real request.
5. Compare the responses.

## Complete example

This script checks a small Stripe Checkout Session simulation against Stripe's test environment. It
uses one parameter object and one client function for both requests.

```ts
import assert from "node:assert/strict";

import { decodeForm, SimApi, SimEnvironment } from "@kensio/simnaril";

const stripeOrigin = "https://api.stripe.com";

interface CheckoutSession {
  amount_total: number;
  created: number;
  currency: string;
  id: string;
  object: "checkout.session";
  url: string;
}

interface CreateCheckoutSessionBody {
  line_items?: {
    price_data?: {
      currency?: string;
      product_data?: { name?: string };
      unit_amount?: string;
    };
    quantity?: string;
  }[];
}

interface CheckoutSessionParams {
  cancelUrl: string;
  currency: string;
  productName: string;
  quantity: number;
  successUrl: string;
  unitAmount: number;
}

async function createCheckoutSession(
  apiKey: string,
  params: CheckoutSessionParams,
): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    cancel_url: params.cancelUrl,
    "line_items[0][price_data][currency]": params.currency,
    "line_items[0][price_data][product_data][name]": params.productName,
    "line_items[0][price_data][unit_amount]": String(params.unitAmount),
    "line_items[0][quantity]": String(params.quantity),
    mode: "payment",
    success_url: params.successUrl,
  });

  const response = await fetch(`${stripeOrigin}/v1/checkout/sessions`, {
    body,
    headers: { authorization: `Bearer ${apiKey}` },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Stripe returned ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as CheckoutSession;
}

const sandboxKey = process.env["STRIPE_TEST_SECRET_KEY"];
if (sandboxKey === undefined || !sandboxKey.startsWith("sk_test_")) {
  throw new Error("STRIPE_TEST_SECRET_KEY must contain a Stripe test key.");
}

const params: CheckoutSessionParams = {
  cancelUrl: "https://example.com/cancel",
  currency: "gbp",
  productName: "Fidelity check",
  quantity: 2,
  successUrl: "https://example.com/success",
  unitAmount: 1_250,
};

const stripe = new SimApi({ decode: decodeForm });
stripe.resource<CheckoutSession, CreateCheckoutSessionBody>({
  path: "/v1/checkout/sessions",
  create(input) {
    const lineItem = input.line_items?.[0];

    return {
      amount_total:
        Number(lineItem?.price_data?.unit_amount) * Number(lineItem?.quantity),
      created: 0,
      currency: lineItem?.price_data?.currency ?? "",
      id: "cs_test_simulated",
      object: "checkout.session",
      url: "https://checkout.stripe.com/c/pay/cs_test_simulated",
    };
  },
});

const environment = new SimEnvironment({ name: "stripe fidelity check" });
let simulated: CheckoutSession;

try {
  environment.register(stripeOrigin, stripe);
  simulated = await createCheckoutSession("sk_test_simulated", params);
} finally {
  environment.dispose();
}

const real = await createCheckoutSession(sandboxKey, params);

const modeledFields = [
  "amount_total",
  "created",
  "currency",
  "id",
  "object",
  "url",
] as const;

for (const field of modeledFields) {
  assert.ok(Object.hasOwn(simulated, field), `simulation omitted ${field}`);
  assert.ok(Object.hasOwn(real, field), `real service omitted ${field}`);
  assert.equal(
    typeof simulated[field],
    typeof real[field],
    `${field} has a different type`,
  );
}

assert.equal(simulated.amount_total, real.amount_total);
assert.equal(simulated.currency, real.currency);
assert.equal(simulated.object, real.object);
```

Set `STRIPE_TEST_SECRET_KEY` in the shell environment, then run the script with Node.js:

```sh
node check-stripe.ts
```

Stripe documents the request fields in its
[Checkout Session API reference](https://docs.stripe.com/api/checkout/sessions/create).

## Choose what to compare

Start with the fields the consumer reads. Check that each field exists and has the same type in both
responses. Then compare the values whose meaning requires equality. In the example,
`amount_total`, `currency`, and `object` must agree.

A type check alone is too weak for values such as `amount_total`. Two numbers can have the same type
and hold different totals.

Identifiers, generated URLs, and timestamps usually differ by design. Check their presence and
types when the consumer uses them. Avoid comparing their exact values unless the real service
defines those values from the request.

The real response may contain fields that the simulation omits. Those fields are outside the
comparison until the consumer reads them. A fidelity check should not turn a focused simulation
into a copy of the vendor's whole API.

## Protect the vendor account

Keep credentials in environment variables. Do not put them in source files or command-line
arguments. Refuse production credentials before making the real request. The example accepts only
Stripe secret test keys with the `sk_test_` prefix.

The real request creates data in the vendor's test environment. Use parameters that are safe for
that account and clean up persistent test data when the service requires it.
