import type {
  SemanticOperation,
  SemanticOperationContext,
} from "./http/operation.js";
import type { RestResource } from "./rest-resource.js";

/** Changes the route of one supplied resource operation. */
export interface RestResourceOperationConfiguration {
  method?: string;
  path?: string;
}

/** Configures the HTTP path and supplied operations for a simulated resource. */
export interface RestResourceProps {
  operations?: Partial<
    Record<RestResourceOperationName, RestResourceOperationConfiguration>
  >;
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
export interface RestResourceOperations<T extends object> {
  create: SemanticOperation<Partial<T>, T, RestResource<T>>;
  delete: SemanticOperation<unknown, T, RestResource<T>>;
  get: SemanticOperation<unknown, T, RestResource<T>>;
  list: SemanticOperation<unknown, T[], RestResource<T>>;
  update: SemanticOperation<Partial<T>, T, RestResource<T>>;
}

/** Configures a domain action under a resource path. */
export interface ResourceOperationProps<T extends object, TInput, TOutput> {
  handle: (
    context: SemanticOperationContext<TInput, RestResource<T>>,
  ) => Promise<TOutput> | TOutput;
  method: string;
  path: string;
}
