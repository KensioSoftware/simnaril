import type { RestResource } from "../rest-resource.js";
import {
  type HttpOperation,
  matchCollection,
  matchItem,
  type RouteMatch,
} from "./operation.js";

const decodeEmpty = (): Promise<void> => Promise.resolve();

const decodeJson = async (request: Request): Promise<unknown> => request.json();

const passThrough = (decoded: unknown): unknown => decoded;

const encodeJson =
  (status: number) =>
  (output: unknown): Response =>
    Response.json(output, { status });

const encodeEmpty = (): Response => new Response(undefined, { status: 204 });

const itemIdentity = (match: RouteMatch): string =>
  (match as { identity: string }).identity;

/** Builds conventional collection and item operations for one resource. */
export function restResourceOperations<T extends object>(
  resource: RestResource<T>,
): HttpOperation[] {
  const collection = matchCollection(resource.path);
  const item = matchItem(resource.path);
  const specificity = resource.path.length;

  return [
    {
      method: "GET",
      match: collection,
      specificity,
      decode: decodeEmpty,
      transform: passThrough,
      operate: () => resource.list(),
      encode: encodeJson(200),
    },
    {
      method: "POST",
      match: collection,
      specificity,
      decode: decodeJson,
      transform: passThrough,
      operate: (input) => resource.create(input as Partial<T>),
      encode: encodeJson(201),
    },
    {
      method: "GET",
      match: item,
      specificity,
      decode: decodeEmpty,
      transform: passThrough,
      operate: (_input, match) => resource.get(itemIdentity(match)),
      encode: encodeJson(200),
    },
    {
      method: "PATCH",
      match: item,
      specificity,
      decode: decodeJson,
      transform: passThrough,
      operate: (input, match) =>
        resource.update(itemIdentity(match), input as Partial<T>),
      encode: encodeJson(200),
    },
    {
      method: "DELETE",
      match: item,
      specificity,
      decode: decodeEmpty,
      transform: passThrough,
      operate: (_input, match) => resource.delete(itemIdentity(match)),
      encode: encodeEmpty,
    },
  ];
}
