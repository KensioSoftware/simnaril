import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertObjectEquals,
  assertResponseStatus,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { decodeJson, SimApi, type RequestDecoder } from "../index.js";

describe("reading a request body", () => {
  interface Widget {
    id: string;
    name: string;
  }

  /**
   * Reads the invented format this suite posts.
   *
   * The package decodes nothing in this shape on its own. A test that reads a
   * value back has therefore proved that the configured decoder ran.
   */
  const decodeColonSeparated: RequestDecoder = async (request) => {
    const body = await request.text();
    const [name, value] = body.split(":");

    return { [name ?? ""]: value };
  };

  const refuseToDecode: RequestDecoder = () => {
    throw new Error("The decoder ran for an operation with no body.");
  };

  const post = (path: string, body: string): Request =>
    new Request(`https://api.example.test${path}`, { body, method: "POST" });

  const widgetName = (): string => faker.commerce.productName();

  it("decodes JSON when no decoder is configured", async () => {
    // Given a resource that names no decoder.
    const api = new SimApi();
    api.resource<Widget>({ path: "/widgets" });
    const name = widgetName();

    // When a JSON body is posted to it.
    const response = await api.handle(
      new Request("https://api.example.test/widgets", {
        body: JSON.stringify({ id: "widget-1", name }),
        method: "POST",
      }),
    );

    // Then the supplied JSON decoding is unchanged.
    assertResponseStatus(response, 201);
    assertObjectEquals(await response.json(), { id: "widget-1", name });
  });

  it("reads a create body with the resource's own decoder", async () => {
    // Given a resource that reads bodies in a format of its own.
    const api = new SimApi();
    const widgets = api.resource<Widget>({
      path: "/widgets",
      decode: decodeColonSeparated,
      create: (input) => ({ id: "widget-1", name: input.name ?? "" }),
    });
    const name = widgetName();

    // When a body in that format is posted.
    const response = await api.handle(post("/widgets", `name:${name}`));

    // Then the decoded input reached the resource's creation behaviour.
    assertResponseStatus(response, 201);
    assertIdentical(widgets.get("widget-1").name, name);
  });

  it("gives a resource the API's decoder when it names none", async () => {
    // Given an API whose services all speak one request format.
    const api = new SimApi({ decode: decodeColonSeparated });
    const widgets = api.resource<Widget>({
      path: "/widgets",
      create: (input) => ({ id: "widget-1", name: input.name ?? "" }),
    });
    const name = widgetName();

    // When a body in that format is posted to a resource of that API.
    await api.handle(post("/widgets", `name:${name}`));

    // Then the API's decoder read it.
    assertIdentical(widgets.get("widget-1").name, name);
  });

  it("lets the closest decoder win", async () => {
    // Given a decoder on the API, one on the resource, and one on the
    // operation, each reading the body differently.
    const api = new SimApi({ decode: refuseToDecode });
    const widgets = api.resource<Widget>({
      path: "/widgets",
      decode: refuseToDecode,
      operations: { create: { decode: decodeColonSeparated } },
      create: (input) => ({ id: "widget-1", name: input.name ?? "" }),
    });
    const name = widgetName();

    // When a body is posted to the operation.
    await api.handle(post("/widgets", `name:${name}`));

    // Then only the operation's own decoder ran.
    assertIdentical(widgets.get("widget-1").name, name);
  });

  it("does not pass an inherited decoder to operations with no body", async () => {
    // Given an API decoder that fails if it is ever asked for a body.
    const api = new SimApi({ decode: refuseToDecode });
    const widgets = api.resource<Widget>({ path: "/widgets" });
    widgets.seed({ id: "widget-1", name: widgetName() });

    // When the operations that are given no body are called.
    const list = await api.handle(
      new Request("https://api.example.test/widgets"),
    );
    const get = await api.handle(
      new Request("https://api.example.test/widgets/widget-1"),
    );
    const deleted = await api.handle(
      new Request("https://api.example.test/widgets/widget-1", {
        method: "DELETE",
      }),
    );

    // Then none of them reached the decoder.
    assertResponseStatus(list, 200);
    assertResponseStatus(get, 200);
    assertResponseStatus(deleted, 204);
  });

  it("reads a delete body with the decoder configured on it", async () => {
    // Given a delete that its service does send a body with.
    const api = new SimApi();
    const widgets = api.resource<Widget>({
      path: "/widgets",
      operations: { delete: { decode: decodeColonSeparated } },
    });
    widgets.seed({ id: "widget-1", name: widgetName() });
    let received: unknown = "not called";
    widgets.operations.delete.override({
      handle: ({ input, params }) => {
        received = input;

        return widgets.delete(params["id"] ?? "");
      },
    });

    // When one arrives carrying a body.
    const response = await api.handle(
      new Request("https://api.example.test/widgets/widget-1", {
        body: "reason:withdrawn",
        method: "DELETE",
      }),
    );

    // Then the configured decoder read it.
    assertResponseStatus(response, 204);
    assertObjectEquals(received, { reason: "withdrawn" });
  });

  it("skips a bodyless operation's own decoder when no body arrives", async () => {
    // Given the same delete, configured with the supplied JSON decoder, which
    // answers "Unexpected end of JSON input" for an empty body.
    const api = new SimApi();
    const widgets = api.resource<Widget>({
      path: "/widgets",
      operations: { delete: { decode: decodeJson } },
    });
    widgets.seed({ id: "widget-1", name: widgetName() });

    // When a delete arrives the ordinary way, with nothing in it.
    const response = await api.handle(
      new Request("https://api.example.test/widgets/widget-1", {
        method: "DELETE",
      }),
    );

    // Then the decoder was never reached and the entity is gone.
    assertResponseStatus(response, 204);
    assertUndefined(widgets.find("widget-1"));
  });

  it("reads a resource operation's body with the inherited decoder", async () => {
    // Given a resource operation below an API that names a decoder.
    const api = new SimApi({ decode: decodeColonSeparated });
    const widgets = api.resource<Widget>({ path: "/widgets" });
    widgets.seed({ id: "widget-1", name: widgetName() });
    widgets.operation<{ name?: string }, Widget>("rename", {
      method: "POST",
      path: "/:id/rename",
      handle: ({ input, params }) =>
        widgets.update(params["id"] ?? "", { name: input.name ?? "" }),
    });
    const name = widgetName();

    // When a body in that format is posted to it.
    await api.handle(post("/widgets/widget-1/rename", `name:${name}`));

    // Then the operation received the decoded input.
    assertIdentical(widgets.get("widget-1").name, name);
  });

  it("asks for no body when a resource operation is sent none", async () => {
    // Given a resource operation below an API whose decoder refuses.
    const api = new SimApi({ decode: refuseToDecode });
    const widgets = api.resource<Widget>({ path: "/widgets" });
    widgets.seed({ id: "widget-1", name: widgetName() });
    let received: unknown = "not called";
    widgets.operation("archive", {
      method: "POST",
      path: "/:id/archive",
      handle: ({ input }) => {
        received = input;
        return widgets.get("widget-1");
      },
    });

    // When it is called with no body at all.
    const response = await api.handle(
      new Request("https://api.example.test/widgets/widget-1/archive", {
        method: "POST",
      }),
    );

    // Then the decoder was never reached and the handler saw no input.
    assertResponseStatus(response, 200);
    assertUndefined(received);
  });
});
