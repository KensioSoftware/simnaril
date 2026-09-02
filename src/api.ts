import {
  createRawHttpOperation,
  type HttpMiddleware,
  type HttpOperationContext,
  operationMiddleware,
  type RawHttpOperation,
} from "./http/operation.js";
import { OperationRouter } from "./http/operation-router.js";
import type { RequestDecoder } from "./http/request-decoder.js";
import { compileRoute, normalizeMethod } from "./http/route.js";
import { attachRestResource, RestResource } from "./rest-resource.js";
import type { RestResourceProps } from "./rest-resource-operation.js";
import { SimResource, type SimResourceProps } from "./resource.js";

/** Configures behaviour shared by every resource on one simulated API. */
export interface SimApiProps {
  /**
   * How request bodies are read, for the resources that read one.
   *
   * JSON when none is given. A resource or an operation can name its own, and
   * the closest one wins.
   */
  decode?: RequestDecoder;
}

/** Configures conventional resource state and its HTTP operations. */
export interface SimApiResourceProps<T extends object>
  extends SimResourceProps<T>, RestResourceProps {}

/** Handles a raw HTTP operation after Simnaril has matched its route. */
export type RawHttpOperationHandler = (
  context: HttpOperationContext,
) => Promise<Response> | Response;

/** Routes HTTP requests to stateful simulated resources. */
export class SimApi {
  readonly #paths = new Set<string>();
  readonly #router = new OperationRouter();
  readonly #decode: RequestDecoder | undefined;

  constructor(props: SimApiProps = {}) {
    this.#decode = props.decode;
  }

  /** Adds middleware around every matched operation in this API. */
  use(middleware: HttpMiddleware): this {
    this.#router.use(middleware);
    return this;
  }

  /** Creates resource state and exposes its conventional HTTP operations. */
  resource<T extends object>(props: SimApiResourceProps<T>): RestResource<T> {
    const { decode, operations, path, ...stateProps } = props;
    const restProps: RestResourceProps = {
      path,
      ...(decode === undefined ? {} : { decode }),
      ...(operations === undefined ? {} : { operations }),
    };
    return this.expose(new SimResource<T>(stateProps), restProps);
  }

  /** Exposes existing resource state through conventional HTTP operations. */
  expose<T extends object>(
    state: SimResource<T>,
    props: RestResourceProps,
  ): RestResource<T> {
    this.#validateResourcePath(props.path);

    if (this.#paths.has(props.path)) {
      throw new TypeError(
        `A resource is already exposed at collection path "${props.path}".`,
      );
    }

    const resource = new RestResource(state, this.#withApiDecode(props));
    attachRestResource(resource, (operation) => {
      this.#router.register(operation);
    });
    this.#paths.add(props.path);
    return resource;
  }

  /** Adds a raw HTTP operation to this API. */
  operation(
    method: string,
    path: string,
    handle: RawHttpOperationHandler,
  ): RawHttpOperation {
    const route = compileRoute(path);
    const operation = createRawHttpOperation();

    this.#router.register({
      ...route,
      decode: () => Promise.resolve(),
      encode: (output) => output as Response,
      method: normalizeMethod(method),
      middleware: operationMiddleware(operation),
      operate: (_input, context) => handle(context),
      resourceMiddleware: [],
      transform: (decoded) => decoded,
    });
    return operation;
  }

  /** Handles one request through the matching simulated HTTP operation. */
  handle(request: Request): Promise<Response> {
    return this.#router.handle(request);
  }

  /** Applies the API's decoder to a resource that has not named its own. */
  #withApiDecode(props: RestResourceProps): RestResourceProps {
    if (props.decode !== undefined || this.#decode === undefined) {
      return props;
    }

    return { ...props, decode: this.#decode };
  }

  #validateResourcePath(path: string): void {
    const base = new URL("https://simnaril.invalid");
    const url = new URL(path, base);

    if (
      url.origin !== base.origin ||
      url.pathname !== path ||
      url.search !== "" ||
      url.hash !== "" ||
      !/^\/[^/:]+(?:\/[^/:]+)*$/u.test(path)
    ) {
      throw new TypeError(
        `Expected a resource collection path such as "/widgets", received "${path}".`,
      );
    }
  }
}
