import type {
  SemanticOperation,
  SemanticOperationContext,
} from "./http/operation.js";
import type { RequestDecoder } from "./http/request-decoder.js";
import type { RestResource } from "./rest-resource.js";

/** Turns matched route parameters into one resource state identity. */
export type ResourceLocator = (
  params: Readonly<Record<string, string>>,
) => string;

/** Changes the route and request decoding of one supplied resource operation. */
export interface RestResourceOperationConfiguration {
  /** Replaces the decoder inherited from the resource or API. */
  decode?: RequestDecoder;
  /** Replaces the supplied operation's conventional HTTP method. */
  method?: string;
  /** Replaces the path appended to the resource collection path. */
  path?: string;
}

/** Configures one supplied operation or leaves its route unimplemented. */
export type RestResourceOperationSetting =
  | RestResourceOperationConfiguration
  | false;

/** Configures the HTTP path and supplied operations for a simulated resource. */
export interface RestResourceProps {
  /** Reads request bodies for operations without their own decoder. */
  decode?: RequestDecoder;
  /** The path appended for get, update and delete. `/:id` by default. */
  itemPath?: string;
  /** Maps item route parameters to state identity. Reads `:id` by default. */
  locate?: ResourceLocator;
  /** Moves, decodes or disables the five supplied operations. */
  operations?: Partial<
    Record<RestResourceOperationName, RestResourceOperationSetting>
  >;
  /** The absolute collection path, including any parent parameters. */
  path: string;
}

/** Names the supplied resource behaviours. */
export type RestResourceOperationName =
  | "list"
  | "create"
  | "get"
  | "update"
  | "delete";

/** Supplied semantic operations for one REST resource. */
export interface RestResourceOperations<
  T extends object,
  TCreate = Partial<T>,
> {
  create: SemanticOperation<TCreate, T, RestResource<T, TCreate>>;
  delete: SemanticOperation<unknown, T, RestResource<T, TCreate>>;
  get: SemanticOperation<unknown, T, RestResource<T, TCreate>>;
  list: SemanticOperation<unknown, T[], RestResource<T, TCreate>>;
  update: SemanticOperation<Partial<T>, T, RestResource<T, TCreate>>;
}

/** Configures a domain action under a resource path. */
export interface ResourceOperationProps<
  T extends object,
  TInput,
  TOutput,
  TCreate = Partial<T>,
> {
  decode?: RequestDecoder;
  handle: (
    context: SemanticOperationContext<TInput, RestResource<T, TCreate>>,
  ) => Promise<TOutput> | TOutput;
  method: string;
  path: string;
}
