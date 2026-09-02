import type { HttpMiddleware, SemanticOperation } from "./http/operation.js";
import { ResourceOperationRegistry } from "./http/resource-operation-registry.js";
import type { SimResource } from "./resource.js";
import type {
  ResourceOperationProps,
  RestResourceOperations,
  RestResourceProps,
} from "./rest-resource-operation.js";

const attachResource = Symbol("attach REST resource");

/** Adds conventional HTTP exposure to simulated resource state. */
export class RestResource<T extends object> {
  readonly operations: RestResourceOperations<T>;
  readonly path: string;
  readonly state: SimResource<T>;
  readonly #operationRegistry: ResourceOperationRegistry<T>;

  constructor(state: SimResource<T>, props: RestResourceProps) {
    this.state = state;
    this.path = props.path;
    this.#operationRegistry = new ResourceOperationRegistry(this, props);
    this.operations = this.#operationRegistry.operations;
  }

  /** Adds middleware around every operation owned by this resource. */
  use(middleware: HttpMiddleware): this {
    this.#operationRegistry.use(middleware);
    return this;
  }

  /** Adds a named domain action under this resource's collection path. */
  operation<TInput = unknown, TOutput = unknown>(
    name: string,
    props: ResourceOperationProps<T, TInput, TOutput>,
  ): SemanticOperation<TInput, TOutput, RestResource<T>> {
    return this.#operationRegistry.add(name, props);
  }

  [attachResource](
    registerOperation: Parameters<ResourceOperationRegistry<T>["attach"]>[0],
  ): void {
    this.#operationRegistry.attach(registerOperation);
  }

  /** Stores an exact entity for simulation arrangement. */
  seed(entity: T): T {
    return this.state.seed(entity);
  }

  /** Runs the resource's creation behaviour and stores its result. */
  create(input: Partial<T>): T {
    return this.state.create(input);
  }

  /** Returns an entity or throws when its identity is absent. */
  get(identity: string): T {
    return this.state.get(identity);
  }

  /** Returns an entity when its identity exists. */
  find(identity: string): T | undefined {
    return this.state.find(identity);
  }

  /** Returns every entity in insertion order. */
  list(): T[] {
    return this.state.list();
  }

  /** Merges changes into an existing entity. */
  update(identity: string, changes: Partial<T>): T {
    return this.state.update(identity, changes);
  }

  /** Deletes an existing entity and returns it. */
  delete(identity: string): T {
    return this.state.delete(identity);
  }

  /** Deletes every entity from this resource. */
  clear(): void {
    this.state.clear();
  }
}

export function attachRestResource<T extends object>(
  resource: RestResource<T>,
  registerOperation: Parameters<ResourceOperationRegistry<T>["attach"]>[0],
): void {
  resource[attachResource](registerOperation);
}
