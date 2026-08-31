import { HttpRequestInterceptor } from "@mswjs/interceptors/http";

export type HttpRequestHandler = (
  request: Request,
) => Promise<Response | undefined> | Response | undefined;

export interface HttpInterception extends Disposable {
  dispose: () => void;
}

/**
 * Starts HTTP interception for this process.
 *
 * The handler returns a response for requests it owns. Returning `undefined`
 * sends the request to its original destination.
 */
export function interceptHttpRequests(
  handle: HttpRequestHandler,
): HttpInterception {
  const interceptor = new HttpRequestInterceptor();

  interceptor.on("request", async ({ request, controller }) => {
    const response = await handle(request);

    if (response === undefined) {
      await controller.passthrough();
      return;
    }

    controller.respondWith(response);
  });

  interceptor.apply();

  const dispose = (): void => {
    interceptor.dispose();
  };

  return {
    dispose,
    [Symbol.dispose]: dispose,
  };
}
