import type { RestResource } from "../rest-resource.js";
import {
  type HttpMiddleware,
  type HttpOperation,
  operationMiddleware,
  runSemanticOperation,
  type SemanticOperation,
} from "./operation.js";
import type { RequestDecoder } from "./request-decoder.js";
import type { CompiledRoute } from "./route.js";
import { normalizeMethod } from "./route.js";

interface SemanticHttpOperationProps<
  T extends object,
  TCreate,
  TInput,
  TOutput,
> {
  decode: RequestDecoder;
  encode: (output: unknown) => Promise<Response> | Response;
  method: string;
  resource: RestResource<T, TCreate>;
  resourceMiddleware: readonly HttpMiddleware[];
  route: CompiledRoute;
  semantic: SemanticOperation<TInput, TOutput, RestResource<T, TCreate>>;
}

/** Adapts a semantic resource operation to shared HTTP execution. */
export function semanticHttpOperation<
  T extends object,
  TCreate,
  TInput,
  TOutput,
>(
  props: SemanticHttpOperationProps<T, TCreate, TInput, TOutput>,
): HttpOperation {
  return {
    ...props.route,
    decode: props.decode,
    encode: props.encode,
    method: normalizeMethod(props.method),
    middleware: operationMiddleware(props.semantic),
    operate: (input, context) =>
      runSemanticOperation(props.semantic, {
        ...context,
        input: input as TInput,
        resource: props.resource,
      }),
    resourceMiddleware: props.resourceMiddleware,
    transform: (decoded) => decoded,
  };
}
