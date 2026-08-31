/** Reports an identity already used by another entity in the resource. */
export class DuplicateEntityError extends Error {
  readonly identity: string;
  readonly resourceName: string | undefined;

  constructor(identity: string, resourceName?: string) {
    const entityName = resourceName ?? "entity";
    const article = resourceName === undefined ? "An" : "A";
    super(
      `${article} ${entityName} already exists with identity "${identity}".`,
    );
    this.name = "DuplicateEntityError";
    this.identity = identity;
    this.resourceName = resourceName;
  }
}
