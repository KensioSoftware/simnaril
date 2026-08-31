import type { CompiledRoute, RouteMatch } from "./route.js";

/** HTTP data shared by handlers and middleware for one matched operation. */
export interface HttpOperationContext {
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
  request: Request;
}

/** Runs around an HTTP operation and its encoded response. */
export type HttpMiddleware = (
  context: HttpOperationContext,
  next: () => Promise<Response>,
) => Promise<Response> | Response;

/** HTTP and semantic data supplied to a semantic operation handler. */
export interface SemanticOperationContext<
  TInput,
  TResource,
> extends HttpOperationContext {
  input: TInput;
  resource: TResource;
}

/** Replaces the semantic behaviour of a supplied operation. */
export interface SemanticOperationOverride<TInput, TOutput, TResource> {
  handle: (
    context: SemanticOperationContext<TInput, TResource>,
  ) => Promise<TOutput> | TOutput;
}

export interface HttpOperation extends CompiledRoute {
  decode: (request: Request) => Promise<unknown>;
  encode: (output: unknown) => Promise<Response> | Response;
  method: string;
  middleware: readonly HttpMiddleware[];
  operate: (input: unknown, context: HttpOperationContext) => unknown;
  resourceMiddleware: readonly HttpMiddleware[];
  transform: (decoded: unknown, match: RouteMatch) => unknown;
}

const middlewareAccess = Symbol("operation middleware");
const semanticRun = Symbol("semantic operation handler");

/** Adds operation middleware and replaces semantic behaviour when supported. */
export class SemanticOperation<TInput, TOutput, TResource> {
  readonly #middleware: HttpMiddleware[] = [];
  #handle: (
    context: SemanticOperationContext<TInput, TResource>,
  ) => Promise<TOutput> | TOutput;

  constructor(
    handle: (
      context: SemanticOperationContext<TInput, TResource>,
    ) => Promise<TOutput> | TOutput,
  ) {
    this.#handle = handle;
  }

  /** Replaces this operation's semantic behaviour. */
  override(
    replacement: SemanticOperationOverride<TInput, TOutput, TResource>,
  ): this {
    this.#handle = replacement.handle;
    return this;
  }

  /** Adds middleware around this operation. */
  use(middleware: HttpMiddleware): this {
    this.#middleware.push(middleware);
    return this;
  }

  [semanticRun](
    context: SemanticOperationContext<TInput, TResource>,
  ): Promise<TOutput> | TOutput {
    return this.#handle(context);
  }

  [middlewareAccess](): readonly HttpMiddleware[] {
    return this.#middleware;
  }
}

/** Adds middleware around a raw HTTP operation. */
export interface RawHttpOperation {
  /** Adds middleware around this operation. */
  use: (middleware: HttpMiddleware) => this;
  [middlewareAccess]: () => readonly HttpMiddleware[];
}

export function createRawHttpOperation(): RawHttpOperation {
  const middleware: HttpMiddleware[] = [];

  return {
    use(added): RawHttpOperation {
      middleware.push(added);
      return this;
    },
    [middlewareAccess]: () => middleware,
  };
}

export function operationMiddleware<TInput, TOutput, TResource>(
  operation: RawHttpOperation | SemanticOperation<TInput, TOutput, TResource>,
): readonly HttpMiddleware[] {
  return operation[middlewareAccess]();
}

export function runSemanticOperation<TInput, TOutput, TResource>(
  operation: SemanticOperation<TInput, TOutput, TResource>,
  context: SemanticOperationContext<TInput, TResource>,
): Promise<TOutput> | TOutput {
  return operation[semanticRun](context);
}
