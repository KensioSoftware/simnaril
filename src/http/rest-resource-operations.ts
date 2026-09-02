import type { RestResource } from "../rest-resource.js";
import type {
  RestResourceOperationConfiguration,
  RestResourceOperations,
  RestResourceProps,
} from "../rest-resource-operation.js";
import {
  type HttpMiddleware,
  type HttpOperation,
  SemanticOperation,
  type SemanticOperationContext,
} from "./operation.js";
import {
  decodeJson,
  decodeWhenPresent,
  type RequestDecoder,
} from "./request-decoder.js";
import { compileRoute } from "./route.js";
import { semanticHttpOperation } from "./semantic-http-operation.js";

const decodeEmpty = (): undefined => undefined;

const encodeJson =
  (status: number) =>
  (output: unknown): Response =>
    Response.json(output, { status });

const encodeEmpty = (): Response => new Response(undefined, { status: 204 });

/**
 * The decoder for an operation that reads a request body.
 *
 * A decoder configured on the operation itself always wins. Below that, one
 * configured on the resource or on the API applies, and JSON is the default.
 */
const bodyDecoder = (
  configuration: RestResourceOperationConfiguration | undefined,
  resource: RequestDecoder | undefined,
): RequestDecoder => configuration?.decode ?? resource ?? decodeJson;

/**
 * The decoder for an operation that is usually given no request body.
 *
 * `list`, `get` and `delete` inherit no decoder from the resource or the API.
 * There would be nothing there for it to read. One configured on the operation
 * itself is honoured, for the services that do send a body with a `DELETE`,
 * and it runs only when a body actually arrived. A decoder handed a bodyless
 * request is how `decodeJson` comes to answer `Unexpected end of JSON input`
 * for a `DELETE` the caller sent nothing with.
 */
const emptyDecoder = (
  configuration: RestResourceOperationConfiguration | undefined,
): RequestDecoder => decodeWhenPresent(configuration?.decode ?? decodeEmpty);

const requiredPathParameter = (
  params: Readonly<Record<string, string>>,
  name: string,
): string => {
  const value = params[name];

  if (value === undefined) {
    throw new TypeError(`Matched operation has no ":${name}" path parameter.`);
  }

  return value;
};

interface SuppliedOperationProps<TInput, TOutput, T extends object> {
  configuration: RestResourceOperationConfiguration | undefined;
  decode: RequestDecoder;
  defaultMethod: string;
  defaultPath: string;
  encode: (output: unknown) => Promise<Response> | Response;
  handle: (
    context: SemanticOperationContext<TInput, RestResource<T>>,
  ) => Promise<TOutput> | TOutput;
  resource: RestResource<T>;
  resourceMiddleware: readonly HttpMiddleware[];
  requiredParameters?: readonly string[];
}

const suppliedOperation = <TInput, TOutput, T extends object>(
  props: SuppliedOperationProps<TInput, TOutput, T>,
): {
  http: HttpOperation;
  semantic: SemanticOperation<TInput, TOutput, RestResource<T>>;
} => {
  const semantic = new SemanticOperation(props.handle);
  const route = compileRoute(
    `${props.resource.path}${props.configuration?.path ?? props.defaultPath}`,
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

/** Builds conventional collection and item operations for one resource. */
export function restResourceOperations<T extends object>(
  resource: RestResource<T>,
  props: RestResourceProps,
  resourceMiddleware: readonly HttpMiddleware[] = [],
): { http: HttpOperation[]; semantic: RestResourceOperations<T> } {
  const configuration = props.operations ?? {};
  const list = suppliedOperation<unknown, T[], T>({
    resource,
    resourceMiddleware,
    configuration: configuration.list,
    defaultMethod: "GET",
    defaultPath: "",
    decode: emptyDecoder(configuration.list),
    handle: ({ resource: operationResource }) => operationResource.list(),
    encode: encodeJson(200),
  });
  const create = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.create,
    defaultMethod: "POST",
    defaultPath: "",
    decode: bodyDecoder(configuration.create, props.decode),
    handle: ({ input, resource: operationResource }) =>
      operationResource.create(input),
    encode: encodeJson(201),
  });
  const get = suppliedOperation<unknown, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.get,
    defaultMethod: "GET",
    defaultPath: "/:id",
    decode: emptyDecoder(configuration.get),
    handle: ({ params, resource: operationResource }) =>
      operationResource.get(requiredPathParameter(params, "id")),
    encode: encodeJson(200),
    requiredParameters: ["id"],
  });
  const update = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.update,
    defaultMethod: "PATCH",
    defaultPath: "/:id",
    decode: bodyDecoder(configuration.update, props.decode),
    handle: ({ input, params, resource: operationResource }) =>
      operationResource.update(requiredPathParameter(params, "id"), input),
    encode: encodeJson(200),
    requiredParameters: ["id"],
  });
  const deleteOperation = suppliedOperation<unknown, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.delete,
    defaultMethod: "DELETE",
    defaultPath: "/:id",
    decode: emptyDecoder(configuration.delete),
    handle: ({ params, resource: operationResource }) =>
      operationResource.delete(requiredPathParameter(params, "id")),
    encode: encodeEmpty,
    requiredParameters: ["id"],
  });

  return {
    http: [list.http, create.http, get.http, update.http, deleteOperation.http],
    semantic: {
      list: list.semantic,
      create: create.semantic,
      get: get.semantic,
      update: update.semantic,
      delete: deleteOperation.semantic,
    },
  };
}
