/** Reports an operation that requires an entity absent from the resource. */
export class EntityNotFoundError extends Error {
  readonly identity: string;
  readonly resourceName: string | undefined;

  constructor(identity: string, resourceName?: string) {
    const entityName = resourceName ?? "entity";
    super(`No ${entityName} exists with identity "${identity}".`);
    this.name = "EntityNotFoundError";
    this.identity = identity;
    this.resourceName = resourceName;
  }
}
