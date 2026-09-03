import { DuplicateEntityError } from "../duplicate-entity-error.js";
import { EntityNotFoundError } from "../entity-not-found-error.js";
import { IdempotencyKeyReusedError } from "../idempotency-key-reused-error.js";
import { UnimplementedRouteError } from "../unimplemented-route-error.js";
import type { ErrorFormatter } from "./error-formatter.js";
import type {
  HttpMiddleware,
  HttpOperation,
  HttpOperationContext,
} from "./operation.js";
import { runHttpOperation, runMiddleware } from "./operation-pipeline.js";
import type { RouteMatch } from "./route.js";

/** Selects and runs registered operations for one simulated API. */
export class OperationRouter {
  readonly #apiName: string;
  readonly #middleware: HttpMiddleware[] = [];
  readonly #operations: HttpOperation[] = [];
  readonly #formatError: ErrorFormatter | undefined;

  constructor(apiName: string, formatError?: ErrorFormatter) {
    this.#apiName = apiName;
    this.#formatError = formatError;
  }

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
      throw new UnimplementedRouteError(request, this.#apiName);
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
      () => runHttpOperation(operation, match, context),
      (action) => this.#translateErrors(action),
    );
  }

  async #translateErrors(
    action: () => Promise<Response> | Response,
  ): Promise<Response> {
    try {
      return await action();
    } catch (error) {
      /*
       * The API's own formatter goes first, so a service that shapes its errors
       * shapes these two as well. Declining one leaves it to the mappings
       * below.
       */
      const formatted = this.#formatError?.(error);

      if (formatted !== undefined) {
        return formatted;
      }

      if (error instanceof EntityNotFoundError) {
        return Response.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof DuplicateEntityError) {
        return Response.json({ error: error.message }, { status: 409 });
      }

      if (error instanceof IdempotencyKeyReusedError) {
        return Response.json({ error: error.message }, { status: 422 });
      }

      throw error;
    }
  }
}
