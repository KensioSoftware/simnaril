import type { RestResource } from "../rest-resource.js";
import type { RestResourceOperationConfiguration } from "../rest-resource-operation.js";
import {
  type HttpMiddleware,
  type HttpOperation,
  SemanticOperation,
  type SemanticOperationContext,
} from "./operation.js";
import type { RequestDecoder } from "./request-decoder.js";
import { compileRoute } from "./route.js";
import { semanticHttpOperation } from "./semantic-http-operation.js";

interface SuppliedOperationProps<TInput, TOutput, T extends object> {
  configuration: RestResourceOperationConfiguration | undefined;
  decode: RequestDecoder;
  defaultMethod: string;
  defaultPath: string;
  enabled: boolean;
  encode: (output: unknown) => Promise<Response> | Response;
  handle: (
    context: SemanticOperationContext<TInput, RestResource<T>>,
  ) => Promise<TOutput> | TOutput;
  resource: RestResource<T>;
  resourceMiddleware: readonly HttpMiddleware[];
  requiredParameters?: readonly string[];
}

export const suppliedOperation = <TInput, TOutput, T extends object>(
  props: SuppliedOperationProps<TInput, TOutput, T>,
): {
  http?: HttpOperation;
  semantic: SemanticOperation<TInput, TOutput, RestResource<T>>;
} => {
  const semantic = new SemanticOperation(props.handle);

  if (!props.enabled) {
    return { semantic };
  }

  const relativePath = props.configuration?.path ?? props.defaultPath;

  if (relativePath !== "" && !relativePath.startsWith("/")) {
    throw new TypeError(
      `Expected a resource-relative operation path such as "/:id", received "${relativePath}".`,
    );
  }

  const route = compileRoute(
    `${props.resource.path}${relativePath}`,
    props.requiredParameters,
  );

  return {
    semantic,
    http: semanticHttpOperation({
      decode: props.decode,
      encode: props.encode,
      method: props.configuration?.method ?? props.defaultMethod,
      resource: props.resource,
      resourceMiddleware: props.resourceMiddleware,
      route,
      semantic,
    }),
  };
};
