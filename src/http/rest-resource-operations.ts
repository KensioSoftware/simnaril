import type { RestResource } from "../rest-resource.js";
import type {
  RestResourceOperationConfiguration,
  RestResourceOperations,
} from "../rest-resource-operation.js";
import {
  type HttpMiddleware,
  type HttpOperation,
  operationMiddleware,
  runSemanticOperation,
  SemanticOperation,
  type SemanticOperationContext,
} from "./operation.js";
import { compileRoute, normalizeMethod } from "./route.js";

const decodeEmpty = (): Promise<unknown> => Promise.resolve();

const decodeJson = async (request: Request): Promise<unknown> => request.json();

const passThrough = (decoded: unknown): unknown => decoded;

const encodeJson =
  (status: number) =>
  (output: unknown): Response =>
    Response.json(output, { status });

const encodeEmpty = (): Response => new Response(undefined, { status: 204 });

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
  decode: (request: Request) => Promise<unknown>;
  defaultMethod: string;
  defaultPath: string;
  encode: (output: unknown) => Promise<Response> | Response;
  handle: (
    context: SemanticOperationContext<TInput, RestResource<T>>,
  ) => Promise<TOutput> | TOutput;
  resource: RestResource<T>;
  resourceMiddleware: readonly HttpMiddleware[];
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
  );

  return {
    semantic,
    http: {
      ...route,
      decode: props.decode,
      encode: props.encode,
      method: normalizeMethod(
        props.configuration?.method ?? props.defaultMethod,
      ),
      middleware: operationMiddleware(semantic),
      operate: (input, context) =>
        runSemanticOperation(semantic, {
          ...context,
          input: input as TInput,
          resource: props.resource,
        }),
      resourceMiddleware: props.resourceMiddleware,
      transform: passThrough,
    },
  };
};

/** Builds conventional collection and item operations for one resource. */
export function restResourceOperations<T extends object>(
  resource: RestResource<T>,
  configuration: Partial<
    Record<keyof RestResourceOperations<T>, RestResourceOperationConfiguration>
  > = {},
  resourceMiddleware: readonly HttpMiddleware[] = [],
): { http: HttpOperation[]; semantic: RestResourceOperations<T> } {
  const list = suppliedOperation<unknown, T[], T>({
    resource,
    resourceMiddleware,
    configuration: configuration.list,
    defaultMethod: "GET",
    defaultPath: "",
    decode: decodeEmpty,
    handle: ({ resource: operationResource }) => operationResource.list(),
    encode: encodeJson(200),
  });
  const create = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.create,
    defaultMethod: "POST",
    defaultPath: "",
    decode: decodeJson,
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
    decode: decodeEmpty,
    handle: ({ params, resource: operationResource }) =>
      operationResource.get(requiredPathParameter(params, "id")),
    encode: encodeJson(200),
  });
  const update = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.update,
    defaultMethod: "PATCH",
    defaultPath: "/:id",
    decode: decodeJson,
    handle: ({ input, params, resource: operationResource }) =>
      operationResource.update(requiredPathParameter(params, "id"), input),
    encode: encodeJson(200),
  });
  const deleteOperation = suppliedOperation<unknown, T, T>({
    resource,
    resourceMiddleware,
    configuration: configuration.delete,
    defaultMethod: "DELETE",
    defaultPath: "/:id",
    decode: decodeEmpty,
    handle: ({ params, resource: operationResource }) =>
      operationResource.delete(requiredPathParameter(params, "id")),
    encode: encodeEmpty,
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
