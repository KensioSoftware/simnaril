import type { RestResource } from "../rest-resource.js";
import type {
  RestResourceOperations,
  RestResourceProps,
} from "../rest-resource-operation.js";
import type { HttpMiddleware, HttpOperation } from "./operation.js";
import {
  bodyDecoder,
  configuredOperation,
  emptyDecoder,
  encodeEmpty,
  encodeJson,
  presentHttpOperations,
} from "./rest-resource-operation-defaults.js";
import { suppliedOperation } from "./supplied-rest-resource-operation.js";

const requiredItemParameters = (props: RestResourceProps): readonly string[] =>
  props.locate === undefined ? ["id"] : [];

/** Builds conventional collection and item operations for one resource. */
export function restResourceOperations<T extends object>(
  resource: RestResource<T>,
  props: RestResourceProps,
  resourceMiddleware: readonly HttpMiddleware[] = [],
): { http: HttpOperation[]; semantic: RestResourceOperations<T> } {
  const configuration = props.operations ?? {};
  const listConfiguration = configuredOperation(configuration.list);
  const createConfiguration = configuredOperation(configuration.create);
  const getConfiguration = configuredOperation(configuration.get);
  const updateConfiguration = configuredOperation(configuration.update);
  const deleteConfiguration = configuredOperation(configuration.delete);
  const itemPath = props.itemPath ?? "/:id";
  const itemParameters = requiredItemParameters(props);
  const list = suppliedOperation<unknown, T[], T>({
    resource,
    resourceMiddleware,
    configuration: listConfiguration,
    defaultMethod: "GET",
    defaultPath: "",
    decode: emptyDecoder(listConfiguration),
    enabled: configuration.list !== false,
    handle: ({ resource: operationResource }) => operationResource.list(),
    encode: encodeJson(200),
  });
  const create = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: createConfiguration,
    defaultMethod: "POST",
    defaultPath: "",
    decode: bodyDecoder(createConfiguration, props.decode),
    enabled: configuration.create !== false,
    handle: ({ input, resource: operationResource }) =>
      operationResource.create(input),
    encode: encodeJson(201),
  });
  const get = suppliedOperation<unknown, T, T>({
    resource,
    resourceMiddleware,
    configuration: getConfiguration,
    defaultMethod: "GET",
    defaultPath: itemPath,
    decode: emptyDecoder(getConfiguration),
    enabled: configuration.get !== false,
    handle: ({ params, resource: operationResource }) =>
      operationResource.get(operationResource.locate(params)),
    encode: encodeJson(200),
    requiredParameters: itemParameters,
  });
  const update = suppliedOperation<Partial<T>, T, T>({
    resource,
    resourceMiddleware,
    configuration: updateConfiguration,
    defaultMethod: "PATCH",
    defaultPath: itemPath,
    decode: bodyDecoder(updateConfiguration, props.decode),
    enabled: configuration.update !== false,
    handle: ({ input, params, resource: operationResource }) =>
      operationResource.update(operationResource.locate(params), input),
    encode: encodeJson(200),
    requiredParameters: itemParameters,
  });
  const deleteOperation = suppliedOperation<unknown, T, T>({
    resource,
    resourceMiddleware,
    configuration: deleteConfiguration,
    defaultMethod: "DELETE",
    defaultPath: itemPath,
    decode: emptyDecoder(deleteConfiguration),
    enabled: configuration.delete !== false,
    handle: ({ params, resource: operationResource }) =>
      operationResource.delete(operationResource.locate(params)),
    encode: encodeEmpty,
    requiredParameters: itemParameters,
  });

  return {
    http: presentHttpOperations(
      list.http,
      create.http,
      get.http,
      update.http,
      deleteOperation.http,
    ),
    semantic: {
      list: list.semantic,
      create: create.semantic,
      get: get.semantic,
      update: update.semantic,
      delete: deleteOperation.semantic,
    },
  };
}
