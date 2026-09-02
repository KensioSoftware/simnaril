import { DuplicateEntityError } from "./duplicate-entity-error.js";
import { EntityNotFoundError } from "./entity-not-found-error.js";

function identifyById(entity: object): string {
  const identity = (entity as { id?: unknown }).id;

  if (typeof identity !== "string") {
    throw new TypeError(
      "The conventional SimResource identity requires a string id. Provide identify for another entity shape.",
    );
  }

  return identity;
}

/** Configures the state and domain behaviour for one simulated resource. */
export interface SimResourceProps<T extends object> {
  create?: (input: Partial<T>) => T;
  identify?: (entity: T) => string;
  name?: string;
}

/** Owns the in-memory state and domain operations for one entity type. */
export class SimResource<T extends object> {
  readonly name: string | undefined;
  readonly #createEntity: (input: Partial<T>) => T;
  readonly #entities = new Map<string, T>();
  readonly #identify: (entity: T) => string;

  constructor(props: SimResourceProps<T> = {}) {
    this.name = props.name;
    this.#createEntity = props.create ?? ((input): T => input as T);
    this.#identify = props.identify ?? identifyById;
  }

  /** Stores an exact entity for simulation arrangement. */
  seed(entity: T): T {
    return this.#insert(entity);
  }

  /** Runs the resource's creation behaviour and stores its result. */
  create(input: Partial<T>): T {
    return this.#insert(this.#createEntity(input));
  }

  /** Returns an entity or throws when its identity is absent. */
  get(identity: string): T {
    const entity = this.#entities.get(identity);

    if (entity === undefined) {
      throw new EntityNotFoundError(identity, this.name);
    }

    return entity;
  }

  /** Returns an entity when its identity exists. */
  find(identity: string): T | undefined {
    return this.#entities.get(identity);
  }

  /** Returns every entity in insertion order. */
  list(): T[] {
    return [...this.#entities.values()];
  }

  /** Merges changes into an existing entity. */
  update(identity: string, changes: Partial<T>): T {
    const existing = this.get(identity);
    const updated = { ...existing, ...changes };
    const updatedIdentity = this.#identify(updated);

    if (updatedIdentity !== identity && this.#entities.has(updatedIdentity)) {
      throw new DuplicateEntityError(updatedIdentity, this.name);
    }

    if (updatedIdentity !== identity) {
      this.#entities.delete(identity);
    }

    this.#entities.set(updatedIdentity, updated);
    return updated;
  }

  /** Deletes an existing entity and returns it. */
  delete(identity: string): T {
    const entity = this.get(identity);
    this.#entities.delete(identity);
    return entity;
  }

  /** Deletes every entity from this resource. */
  clear(): void {
    this.#entities.clear();
  }

  #insert(entity: T): T {
    const identity = this.#identify(entity);

    if (this.#entities.has(identity)) {
      throw new DuplicateEntityError(identity, this.name);
    }

    this.#entities.set(identity, entity);
    return entity;
  }
}
