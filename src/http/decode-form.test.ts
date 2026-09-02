import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { decodeForm } from "../index.js";

describe("decoding a form-encoded body", () => {
  const post = (body: string): Request =>
    new Request("https://api.example.test/things", { body, method: "POST" });

  const decode = (body: string): Promise<unknown> =>
    Promise.resolve(decodeForm(post(body)));

  const refuse = async (body: string): Promise<SyntaxError> => {
    const error = await assertThrowsErrorAsync(() => decode(body));

    assertInstanceOf(error, SyntaxError);

    return error;
  };

  it("reads flat pairs as strings", async () => {
    // Given a body of ordinary name and value pairs.
    const name = faker.commerce.productName();
    const body = new URLSearchParams({ name, quantity: "2" }).toString();

    // When it is decoded.
    const decoded = await decode(body);

    // Then every leaf is the string the body carried.
    assertObjectEquals(decoded, { name, quantity: "2" });
  });

  it("reads bracketed parts as nested objects", async () => {
    // Given a key nesting through named parts.
    const body = "price_data[product_data][name]=Card";

    // When it is decoded.
    const decoded = await decode(body);

    // Then each part is one level of object.
    assertObjectEquals(decoded, {
      price_data: { product_data: { name: "Card" } },
    });
  });

  it("reads numbered parts as arrays", async () => {
    // Given the shape Stripe's own encoder emits for a list.
    const body =
      "line_items[0][price_data][unit_amount]=250&line_items[0][quantity]=1" +
      "&line_items[1][price_data][unit_amount]=695&line_items[1][quantity]=3";

    // When it is decoded.
    const decoded = await decode(body);

    // Then the numbered parts became an array in index order.
    assertObjectEquals(decoded, {
      line_items: [
        { price_data: { unit_amount: "250" }, quantity: "1" },
        { price_data: { unit_amount: "695" }, quantity: "3" },
      ],
    });
  });

  it("appends for an empty bracket", async () => {
    // Given a key that appends instead of numbering.
    const body = "expand[]=customer&expand[]=payment_intent";

    // When it is decoded.
    const decoded = await decode(body);

    // Then the values arrive in the order the body wrote them.
    assertObjectEquals(decoded, { expand: ["customer", "payment_intent"] });
  });

  it("orders by index without leaving gaps", async () => {
    // Given indexes that count unevenly.
    const body = "tag[9]=late&tag[0]=first&tag[5]=middle";

    // When it is decoded.
    const decoded = await decode(body);

    // Then the indexes ordered the entries and left no empty slots.
    assertObjectEquals(decoded, { tag: ["first", "middle", "late"] });
  });

  it("reads an empty body as an empty object", async () => {
    // Given a request with nothing in its body.
    // When it is decoded.
    const decoded = await decode("");

    // Then the operation is given an object with no keys.
    assertObjectEquals(decoded, {});
  });

  it("keeps a hostile __proto__ key as an ordinary property", async () => {
    // Given a body naming the prototype.
    const body = "__proto__[polluted]=yes";

    // When it is decoded.
    const decoded = await decode(body);

    // Then the key is the decoded object's own, its prototype is the ordinary
    // one, and the prototype every other object shares is untouched.
    assertTrue(Object.hasOwn(decoded as object, "__proto__"));
    assertIdentical(Object.getPrototypeOf(decoded), Object.prototype);
    assertObjectEquals((decoded as Record<string, unknown>)["__proto__"], {
      polluted: "yes",
    });
    assertUndefined(({} as Record<string, unknown>)["polluted"]);
  });

  it("refuses a key given twice", async () => {
    // Given a body naming one key with two values.
    // When it is decoded.
    const error = await refuse("name=first&name=second");

    // Then it names the key instead of choosing between the values.
    assertStringIncludes(error.message, 'Form key "name" is given twice.');
  });

  it("refuses a part holding a value and more keys at once", async () => {
    // Given a key that is both a leaf and a branch.
    // When it is decoded.
    const error = await refuse("a=1&a[b]=2");

    // Then it names the part that would have to be both.
    assertStringIncludes(error.message, "a value and more keys at once");
  });

  it("refuses an empty bracket before the last part", async () => {
    // Given an append in the middle of a key, where the position is a guess.
    // When it is decoded.
    const error = await refuse("a[][b]=1");

    // Then it says where the empty bracket is.
    assertStringIncludes(error.message, "empty bracket before its last part");
  });

  it("refuses a key that brackets cannot be read out of", async () => {
    // Given keys with unbalanced or leading brackets.
    const malformed = ["a[b=1", "[a]=1", "a]b[=1"];

    // When each is decoded.
    const errors = await Promise.all(malformed.map((body) => refuse(body)));

    // Then each one names the key it could not read.
    for (const error of errors) {
      assertStringIncludes(error.message, "bracketed parts");
    }
  });
});
