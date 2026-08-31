import { HttpRequestInterceptor } from "@mswjs/interceptors/http";

export type HttpRequestHandler = (
  request: Request,
) => Promise<Response | undefined> | Response | undefined;

export interface HttpInterception extends Disposable {
  dispose: () => void;
}

const requestHandlers = new Map<object, HttpRequestHandler>();
let activeInterceptor: HttpRequestInterceptor | undefined;

async function handleInterceptedRequest(
  request: Request,
  handlers: MapIterator<HttpRequestHandler> = requestHandlers.values(),
): Promise<Response | undefined> {
  const nextHandler = handlers.next();

  if (nextHandler.done === true) {
    return undefined;
  }

  const response = await nextHandler.value(request.clone());
  return response ?? handleInterceptedRequest(request, handlers);
}

function startInterceptor(): HttpRequestInterceptor {
  const interceptor = new HttpRequestInterceptor();

  interceptor.on("request", async ({ request, controller }) => {
    const response = await handleInterceptedRequest(request);

    if (response === undefined) {
      await controller.passthrough();
      return;
    }

    controller.respondWith(response);
  });
  interceptor.on("unhandledException", ({ controller, error }) => {
    controller.errorWith(error);
  });

  interceptor.apply();
  return interceptor;
}

/**
 * Subscribes a handler to HTTP interception for this process.
 *
 * The handler returns a response for requests it owns. Returning `undefined`
 * lets the next subscriber inspect the request. The first subscription starts
 * interception, and disposing the last subscription stops it.
 */
export function interceptHttpRequests(
  handle: HttpRequestHandler,
): HttpInterception {
  const subscription = {};
  requestHandlers.set(subscription, handle);
  activeInterceptor ??= startInterceptor();

  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    requestHandlers.delete(subscription);

    if (requestHandlers.size === 0) {
      activeInterceptor?.dispose();
      activeInterceptor = undefined;
    }
  };

  return {
    dispose,
    [Symbol.dispose]: dispose,
  };
}
