import { DuplicateEntityError } from "./duplicate-entity-error.js";
import { EntityNotFoundError } from "./entity-not-found-error.js";
import {
  type HttpOperation,
  type RouteMatch,
  runHttpOperation,
} from "./http/operation.js";
import { restResourceOperations } from "./http/rest-resource-operations.js";
import { RestResource, type RestResourceProps } from "./rest-resource.js";
import { SimResource, type SimResourceProps } from "./resource.js";
import { UnimplementedRouteError } from "./unimplemented-route-error.js";

/** Configures conventional resource state and its HTTP collection path. */
export interface SimApiResourceProps<T extends object>
  extends SimResourceProps<T>, RestResourceProps {}

/** Routes HTTP requests to stateful simulated resources. */
export class SimApi {
  readonly #operations: HttpOperation[] = [];
  readonly #paths = new Set<string>();

  /** Creates resource state and exposes its conventional HTTP operations. */
  resource<T extends object>(props: SimApiResourceProps<T>): RestResource<T> {
    const { path, ...stateProps } = props;
    return this.expose(new SimResource<T>(stateProps), { path });
  }

  /** Exposes existing resource state through conventional HTTP operations. */
  expose<T extends object>(
    state: SimResource<T>,
    props: RestResourceProps,
  ): RestResource<T> {
    this.#validatePath(props.path);

    if (this.#paths.has(props.path)) {
      throw new TypeError(
        `A resource is already exposed at collection path "${props.path}".`,
      );
    }

    const resource = new RestResource(state, props);
    this.#paths.add(props.path);
    this.#operations.push(...restResourceOperations(resource));
    return resource;
  }

  /** Handles one request through the matching simulated HTTP operation. */
  async handle(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const method = request.method.toUpperCase();
    let selected: { match: RouteMatch; operation: HttpOperation } | undefined;

    for (const operation of this.#operations) {
      if (operation.method !== method) {
        continue;
      }

      const match = operation.match(pathname);

      if (
        match !== undefined &&
        (selected === undefined ||
          operation.specificity > selected.operation.specificity)
      ) {
        selected = { match, operation };
      }
    }

    if (selected !== undefined) {
      return this.#run(selected.operation, request, selected.match);
    }

    throw new UnimplementedRouteError(request);
  }

  async #run(
    operation: HttpOperation,
    request: Request,
    match: RouteMatch,
  ): Promise<Response> {
    try {
      return await runHttpOperation(operation, request, match);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return Response.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof DuplicateEntityError) {
        return Response.json({ error: error.message }, { status: 409 });
      }

      throw error;
    }
  }

  #validatePath(path: string): void {
    const base = new URL("https://simnaril.invalid");
    const url = new URL(path, base);

    if (
      url.origin !== base.origin ||
      url.pathname !== path ||
      url.search !== "" ||
      url.hash !== "" ||
      !/^\/[^/]+(?:\/[^/]+)*$/u.test(path)
    ) {
      throw new TypeError(
        `Expected a resource collection path such as "/widgets", received "${path}".`,
      );
    }
  }
}
