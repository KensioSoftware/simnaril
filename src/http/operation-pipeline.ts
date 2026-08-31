import type {
  HttpMiddleware,
  HttpOperation,
  HttpOperationContext,
} from "./operation.js";
import type { RouteMatch } from "./route.js";

/** Runs the protocol and semantic steps for a matched HTTP operation. */
export async function runHttpOperation(
  operation: HttpOperation,
  request: Request,
  match: RouteMatch,
): Promise<Response> {
  const context: HttpOperationContext = {
    params: match.params,
    query: new URL(request.url).searchParams,
    request,
  };
  const decoded = await operation.decode(request);
  const input = await operation.transform(decoded, match);
  const output = await operation.operate(input, context);
  return operation.encode(output);
}

/** Runs middleware in registration order and unwinds the response in reverse. */
export async function runMiddleware(
  context: HttpOperationContext,
  middleware: readonly HttpMiddleware[],
  operation: () => Promise<Response>,
  translateErrors: (
    action: () => Promise<Response> | Response,
  ) => Promise<Response>,
): Promise<Response> {
  let activeIndex = -1;

  const dispatch = async (index: number): Promise<Response> => {
    if (index <= activeIndex) {
      throw new Error("Middleware called next() more than once.");
    }

    activeIndex = index;
    const current = middleware[index];

    if (current === undefined) {
      return translateErrors(operation);
    }

    return translateErrors(() => current(context, () => dispatch(index + 1)));
  };

  return dispatch(0);
}
