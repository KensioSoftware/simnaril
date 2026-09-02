import type {
  RestResourceOperationConfiguration,
  RestResourceOperationSetting,
} from "../rest-resource-operation.js";
import type { HttpOperation } from "./operation.js";
import {
  decodeJson,
  decodeNothing,
  decodeWhenPresent,
  type RequestDecoder,
} from "./request-decoder.js";

export const encodeJson =
  (status: number) =>
  (output: unknown): Response =>
    Response.json(output, { status });

export const encodeEmpty = (): Response =>
  new Response(undefined, { status: 204 });

export const bodyDecoder = (
  configuration: RestResourceOperationConfiguration | undefined,
  resource: RequestDecoder | undefined,
): RequestDecoder => configuration?.decode ?? resource ?? decodeJson;

export const emptyDecoder = (
  configuration: RestResourceOperationConfiguration | undefined,
): RequestDecoder => decodeWhenPresent(configuration?.decode ?? decodeNothing);

export const configuredOperation = (
  setting: RestResourceOperationSetting | undefined,
): RestResourceOperationConfiguration | undefined =>
  setting === false ? undefined : setting;

export const presentHttpOperations = (
  ...operations: (HttpOperation | undefined)[]
): HttpOperation[] =>
  operations.filter(
    (operation): operation is HttpOperation => operation !== undefined,
  );
