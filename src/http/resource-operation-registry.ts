import type { RestResource } from "../rest-resource.js";
import type {
  ResourceOperationProps,
  RestResourceOperations,
  RestResourceProps,
} from "../rest-resource-operation.js";
import type {
  HttpMiddleware,
  HttpOperation,
  SemanticOperation,
} from "./operation.js";
import { decodeJson, type RequestDecoder } from "./request-decoder.js";
import { resourceOperation } from "./resource-operation.js";
import { restResourceOperations } from "./rest-resource-operations.js";

/** Registers supplied and custom operations owned by one REST resource. */
export class ResourceOperationRegistry<T extends object> {
  readonly operations: RestResourceOperations<T>;
  readonly #httpOperations: HttpOperation[];
  readonly #middleware: HttpMiddleware[] = [];
  readonly #names = new Set<string>([
    "list",
    "create",
    "get",
    "update",
    "delete",
  ]);
  readonly #resource: RestResource<T>;
  readonly #decode: RequestDecoder | undefined;
  #registerOperation: ((operation: HttpOperation) => void) | undefined;

  constructor(resource: RestResource<T>, props: RestResourceProps) {
    this.#resource = resource;
    this.#decode = props.decode;
    const supplied = restResourceOperations(resource, props, this.#middleware);
    this.#httpOperations = supplied.http;
    this.operations = supplied.semantic;
  }

  use(middleware: HttpMiddleware): void {
    this.#middleware.push(middleware);
  }

  add<TInput, TOutput>(
    name: string,
    props: ResourceOperationProps<T, TInput, TOutput>,
  ): SemanticOperation<TInput, TOutput, RestResource<T>> {
    if (this.#names.has(name)) {
      throw new TypeError(
        `An operation named "${name}" already exists on resource path "${this.#resource.path}".`,
      );
    }

    if (!props.path.startsWith("/")) {
      throw new TypeError(
        `Expected a resource operation path such as "/:id/archive", received "${props.path}".`,
      );
    }

    const operation = resourceOperation(
      this.#resource,
      this.#middleware,
      props,
      props.decode ?? this.#decode ?? decodeJson,
    );
    this.#names.add(name);
    this.#httpOperations.push(operation.http);
    this.#registerOperation?.(operation.http);
    return operation.semantic;
  }

  attach(registerOperation: (operation: HttpOperation) => void): void {
    this.#registerOperation = registerOperation;

    for (const operation of this.#httpOperations) {
      registerOperation(operation);
    }
  }
}
