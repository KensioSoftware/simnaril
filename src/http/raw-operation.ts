import type { HttpOperationContext, RawHttpOperation } from "./operation.js";
import { createRawHttpOperation, operationMiddleware } from "./operation.js";
import type { HttpOperation } from "./operation.js";
import { decodeNothing } from "./request-decoder.js";
import { compileRoute, normalizeMethod } from "./route.js";

/** Handles a raw HTTP operation after Simnaril has matched its route. */
export type RawHttpOperationHandler = (
  context: HttpOperationContext,
) => Promise<Response> | Response;

/**
 * Builds an operation whose handler owns the whole response.
 *
 * The router still supplies the matched path parameters and the query, so a
 * handler down here reimplements no route matching. Everything above that is
 * the handler's, including the status and the body.
 */
export function rawOperation(
  method: string,
  path: string,
  handle: RawHttpOperationHandler,
): { http: HttpOperation; operation: RawHttpOperation } {
  const operation = createRawHttpOperation();

  return {
    operation,
    http: {
      ...compileRoute(path),
      decode: decodeNothing,
      encode: (output) => output as Response,
      method: normalizeMethod(method),
      middleware: operationMiddleware(operation),
      operate: (_input, context) => handle(context),
      resourceMiddleware: [],
      transform: (decoded) => decoded,
    },
  };
}
