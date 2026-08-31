import type { RestResource } from "../rest-resource.js";
import type { ResourceOperationProps } from "../rest-resource-operation.js";
import {
  type HttpMiddleware,
  type HttpOperation,
  SemanticOperation,
} from "./operation.js";
import { compileRoute } from "./route.js";
import { semanticHttpOperation } from "./semantic-http-operation.js";

const decodeResourceOperation = async (request: Request): Promise<unknown> =>
  request.body === null ? undefined : request.json();

const encodeResourceOperation = (output: unknown): Response =>
  output === undefined
    ? new Response(undefined, { status: 204 })
    : Response.json(output);

/** Builds one named semantic operation below a resource path. */
export function resourceOperation<T extends object, TInput, TOutput>(
  resource: RestResource<T>,
  middleware: readonly HttpMiddleware[],
  props: ResourceOperationProps<T, TInput, TOutput>,
): {
  http: HttpOperation;
  semantic: SemanticOperation<TInput, TOutput, RestResource<T>>;
} {
  const route = compileRoute(`${resource.path}${props.path}`);
  const semantic = new SemanticOperation(props.handle);

  return {
    semantic,
    http: semanticHttpOperation({
      decode: decodeResourceOperation,
      encode: encodeResourceOperation,
      method: props.method,
      resource,
      resourceMiddleware: middleware,
      route,
      semantic,
    }),
  };
}
