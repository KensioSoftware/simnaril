import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";

import { SimEnvironment, type SimService } from "./index.js";

describe("a simulation environment", () => {
  class SimWidgets implements SimService {
    readonly requests: {
      body: string;
      method: string;
      url: string;
    }[] = [];
    readonly #responseBody: string;
    readonly #responseHeaders: Headers;
    readonly #responseStatus: number;

    constructor(
      responseBody: string,
      responseStatus = 200,
      responseHeaders = new Headers(),
    ) {
      this.#responseBody = responseBody;
      this.#responseStatus = responseStatus;
      this.#responseHeaders = responseHeaders;
    }

    async handle(request: Request): Promise<Response> {
      this.requests.push({
        body: await request.text(),
        method: request.method,
        url: request.url,
      });

      return new Response(this.#responseBody, {
        headers: this.#responseHeaders,
        status: this.#responseStatus,
      });
    }
  }

  it("routes requests for a registered origin and preserves the response", async () => {
    // Given a service registered under its production origin.
    const origin = `https://${faker.internet.domainName()}`;
    const url = `${origin}/v1/widgets?expand=owner`;
    const requestBody = faker.string.uuid();
    const responseBody = faker.string.uuid();
    const responseHeader = faker.string.uuid();
    const widgets = new SimWidgets(
      responseBody,
      201,
      new Headers({ "x-simulated-by": responseHeader }),
    );
    using environment = new SimEnvironment();
    environment.register(new URL(origin), widgets);

    // When ordinary application code sends a request to that origin.
    const response = await fetch(url, {
      body: requestBody,
      method: "POST",
    });

    // Then the service receives the request and its whole response reaches the
    // application code.
    assertObjectEquals(widgets.requests, [
      { body: requestBody, method: "POST", url },
    ]);
    assertIdentical(response.status, 201);
    assertIdentical(response.headers.get("x-simulated-by"), responseHeader);
    assertIdentical(await response.text(), responseBody);
  });

  it("keeps service state inside the environment that registered it", async () => {
    // Given two live environments with services under separate origins.
    const firstOrigin = `https://${faker.internet.domainName()}`;
    const secondOrigin = `https://${faker.internet.domainName()}`;
    const firstBody = faker.string.uuid();
    const secondBody = faker.string.uuid();
    const firstWidgets = new SimWidgets(firstBody);
    const secondWidgets = new SimWidgets(secondBody);
    using firstEnvironment = new SimEnvironment();
    using secondEnvironment = new SimEnvironment();
    firstEnvironment.register(firstOrigin, firstWidgets);
    secondEnvironment.register(secondOrigin, secondWidgets);

    // When application code calls both origins.
    const firstResponse = await fetch(`${firstOrigin}/v1/widgets`);
    const secondResponse = await fetch(`${secondOrigin}/v1/widgets`);

    // Then each environment routes only to its own service.
    assertIdentical(await firstResponse.text(), firstBody);
    assertIdentical(await secondResponse.text(), secondBody);
    assertObjectEquals(firstWidgets.requests, [
      { body: "", method: "GET", url: `${firstOrigin}/v1/widgets` },
    ]);
    assertObjectEquals(secondWidgets.requests, [
      { body: "", method: "GET", url: `${secondOrigin}/v1/widgets` },
    ]);
  });

  it("stops intercepting when using disposes the environment", async () => {
    // Given a real origin temporarily replaced by a simulated service.
    const realBody = faker.string.uuid();
    const simulatedBody = faker.string.uuid();
    await using server = createServer((_request, response) => {
      response.end(realBody);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;

    {
      using environment = new SimEnvironment();
      environment.register(origin, new SimWidgets(simulatedBody));
      assertIdentical(
        await fetch(origin).then((response) => response.text()),
        simulatedBody,
      );
    }

    // When application code calls the origin after the using block.
    const response = await fetch(origin);

    // Then the request reaches the real origin again.
    assertIdentical(await response.text(), realBody);
  });

  it("rejects a URL whose path would make registration ambiguous", () => {
    // Given an environment and a URL below an origin.
    using environment = new SimEnvironment();
    const url = `https://${faker.internet.domainName()}/v1`;

    // When the URL is registered as if it were an origin.
    const error = assertThrowsError(() => {
      environment.register(url, new SimWidgets(faker.string.uuid()));
    });

    // Then the error preserves the path and asks for an origin.
    assertStringIncludes(error.message, "Expected an HTTP origin");
    assertStringIncludes(error.message, url);
  });

  it("rejects two services for the same origin", () => {
    // Given an origin that already has a simulated service.
    using environment = new SimEnvironment();
    const origin = `https://${faker.internet.domainName()}`;
    environment.register(origin, new SimWidgets(faker.string.uuid()));

    // When another service is registered for the same origin.
    const error = assertThrowsError(() => {
      environment.register(origin, new SimWidgets(faker.string.uuid()));
    });

    // Then the environment reports the ambiguous registration.
    assertStringIncludes(error.message, "already registered");
    assertStringIncludes(error.message, origin);
  });

  it("rejects an origin owned by another live environment", async () => {
    // Given an origin registered in one live environment.
    const origin = `https://${faker.internet.domainName()}`;
    const firstBody = faker.string.uuid();
    const secondBody = faker.string.uuid();
    using firstEnvironment = new SimEnvironment();
    using secondEnvironment = new SimEnvironment();
    firstEnvironment.register(origin, new SimWidgets(firstBody));

    // When another live environment claims the same origin.
    const error = assertThrowsError(() => {
      secondEnvironment.register(origin, new SimWidgets(secondBody));
    });

    // Then the conflict is explicit, and disposal releases the origin for the
    // second environment.
    assertStringIncludes(error.message, "Another active SimEnvironment");
    firstEnvironment.dispose();
    secondEnvironment.register(origin, new SimWidgets(secondBody));
    assertIdentical(
      await fetch(origin).then((response) => response.text()),
      secondBody,
    );
  });

  it("cannot be registered with after disposal", () => {
    // Given an environment that has released its process resources.
    using environment = new SimEnvironment();
    environment.dispose();
    environment.dispose();
    const origin = `https://${faker.internet.domainName()}`;

    // When a service is registered after disposal.
    const error = assertThrowsError(() => {
      environment.register(origin, new SimWidgets(faker.string.uuid()));
    });

    // Then the environment reports its completed lifecycle.
    assertStringIncludes(error.message, "disposed SimEnvironment");
  });

  it("accepts HTTP origins only", () => {
    // Given an environment and a non-HTTP origin.
    using environment = new SimEnvironment();
    const origin = `ftp://${faker.internet.domainName()}`;

    // When the origin is registered.
    const error = assertThrowsError(() => {
      environment.register(origin, new SimWidgets(faker.string.uuid()));
    });

    // Then the error states the supported protocol boundary.
    assertStringIncludes(error.message, "Expected an HTTP origin");
  });
});
