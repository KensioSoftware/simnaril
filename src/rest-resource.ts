import type { SimResource } from "./resource.js";

/** Configures the HTTP path for a simulated resource. */
export interface RestResourceProps {
  path: string;
}

/** Adds conventional HTTP exposure to simulated resource state. */
export class RestResource<T extends object> {
  readonly path: string;
  readonly state: SimResource<T>;

  constructor(state: SimResource<T>, props: RestResourceProps) {
    this.state = state;
    this.path = props.path;
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
