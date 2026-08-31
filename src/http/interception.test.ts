import { faker } from "@faker-js/faker";
import { once } from "node:events";
import { get as httpGet, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { interceptHttpRequests } from "./interception.js";

describe("HTTP interception", () => {
  const readWithClientRequest = async (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const request = httpGet(url, (response) => {
        response.setEncoding("utf8");

        let body = "";
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(body);
        });
      });

      request.on("error", reject);
    });

  it("restores normal process behaviour when disposed", async () => {
    // Given a real origin and an interceptor that handles one of its paths.
    const originBody = faker.string.uuid();
    const simulatedBody = faker.string.uuid();
    await using server = createServer((_request, response) => {
      response.end(originBody);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const interceptedUrl = `${origin}/intercepted`;
    const passedThroughUrl = `${origin}/passed-through`;
    using interception = interceptHttpRequests((request) => {
      if (request.url === interceptedUrl) {
        return new Response(simulatedBody);
      }

      return undefined;
    });

    // When fetch and ClientRequest call the intercepted URL.
    const fetchBody = await fetch(interceptedUrl).then((response) =>
      response.text(),
    );
    const clientRequestBody = await readWithClientRequest(interceptedUrl);

    // Then both clients receive the in-process response, while unmatched calls
    // still reach their original destination.
    expect(fetchBody).toBe(simulatedBody);
    expect(clientRequestBody).toBe(simulatedBody);
    await expect(
      fetch(passedThroughUrl).then((response) => response.text()),
    ).resolves.toBe(originBody);

    // When interception is disposed.
    interception.dispose();

    // Then both clients regain their normal process behaviour.
    await expect(
      fetch(interceptedUrl).then((response) => response.text()),
    ).resolves.toBe(originBody);
    await expect(readWithClientRequest(interceptedUrl)).resolves.toBe(
      originBody,
    );
  });
});
