import { DuplicateEntityError } from "../duplicate-entity-error.js";
import { EntityNotFoundError } from "../entity-not-found-error.js";
import { UnimplementedRouteError } from "../unimplemented-route-error.js";
import type {
  HttpMiddleware,
  HttpOperation,
  HttpOperationContext,
} from "./operation.js";
import { runHttpOperation, runMiddleware } from "./operation-pipeline.js";
import type { RouteMatch } from "./route.js";

/** Selects and runs registered operations for one simulated API. */
export class OperationRouter {
  readonly #middleware: HttpMiddleware[] = [];
  readonly #operations: HttpOperation[] = [];

  use(middleware: HttpMiddleware): void {
    this.#middleware.push(middleware);
  }

  register(operation: HttpOperation): void {
    this.#operations.push(operation);
  }

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

    if (selected === undefined) {
      throw new UnimplementedRouteError(request);
    }

    return this.#run(selected.operation, request, selected.match);
  }

  async #run(
    operation: HttpOperation,
    request: Request,
    match: RouteMatch,
  ): Promise<Response> {
    const context: HttpOperationContext = {
      params: match.params,
      query: new URL(request.url).searchParams,
      request,
    };
    const middleware = [
      ...this.#middleware,
      ...operation.resourceMiddleware,
      ...operation.middleware,
    ];

    return runMiddleware(
      context,
      middleware,
      () => runHttpOperation(operation, request, match),
      (action) => this.#translateErrors(action),
    );
  }

  async #translateErrors(
    action: () => Promise<Response> | Response,
  ): Promise<Response> {
    try {
      return await action();
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
}
