import { faker } from "@faker-js/faker";
import { assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { unhandledRequest } from "./index.js";

describe("the unhandled request message", () => {
  it("names the simulator, the request and what is missing", () => {
    // Given a request to a production-style URL, and a simulator that got to
    // the end of its routing without matching it.
    const service = `Sim${faker.string.alpha({ length: 6 })}`;
    const url = `https://api.example.com/v1/${faker.string.alpha(8)}`;
    const request = new Request(url, { method: "POST" });

    // When the simulator says what happened.
    const message = unhandledRequest(service, request);

    // Then a reader gets the simulator, the request, and the gap in one line.
    assertStringIncludes(message, `POST ${url} reached ${service}`);
    assertStringIncludes(message, `${service} has no handler for POST /v1/`);
  });

  it("names the missing handler by path, leaving the query out", () => {
    // Given a request carrying a query string.
    const request = new Request("https://api.example.com/v1/widgets?page=2", {
      method: "GET",
    });

    // When the simulator says what happened.
    const message = unhandledRequest("SimExample", request);

    // Then the URL is quoted whole, and the handler is named by path alone.
    assertStringIncludes(message, "https://api.example.com/v1/widgets?page=2");
    assertStringIncludes(message, "no handler for GET /v1/widgets.");
  });
});
