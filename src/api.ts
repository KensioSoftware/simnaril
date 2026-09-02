import type { HttpMiddleware, RawHttpOperation } from "./http/operation.js";
import type { ErrorFormatter } from "./http/error-formatter.js";
import { OperationRouter } from "./http/operation-router.js";
import {
  rawOperation,
  type RawHttpOperationHandler,
} from "./http/raw-operation.js";
import type { RequestDecoder } from "./http/request-decoder.js";
import { validateResourcePath } from "./http/resource-path.js";
import { attachRestResource, RestResource } from "./rest-resource.js";
import type { RestResourceProps } from "./rest-resource-operation.js";
import { SimResource, type SimResourceProps } from "./resource.js";

const resourcePathShape = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");

/** Configures behaviour shared by every resource on one simulated API. */
export interface SimApiProps {
  /** The service name used in route errors. `SimApi` when none is given. */
  name?: string;

  /**
   * How request bodies are read, for the resources that read one.
   *
   * JSON when none is given. A resource or an operation can name its own, and
   * the closest one wins.
   */
  decode?: RequestDecoder;

  /**
   * How a thrown error becomes a response.
   *
   * Runs before the supplied `EntityNotFoundError` and `DuplicateEntityError`
   * mappings, and declining an error with `undefined` leaves it to them.
   */
  formatError?: ErrorFormatter;
}

/** Configures conventional resource state and its HTTP operations. */
export interface SimApiResourceProps<T extends object>
  extends SimResourceProps<T>, RestResourceProps {}

/** Routes HTTP requests to stateful simulated resources. */
export class SimApi {
  readonly name: string;
  readonly #paths = new Set<string>();
  readonly #router: OperationRouter;
  readonly #decode: RequestDecoder | undefined;

  constructor(props: SimApiProps = {}) {
    this.name = props.name ?? "SimApi";
    this.#decode = props.decode;
    this.#router = new OperationRouter(this.name, props.formatError);
  }

  /** Adds middleware around every matched operation in this API. */
  use(middleware: HttpMiddleware): this {
    this.#router.use(middleware);
    return this;
  }

  /** Creates resource state and exposes its conventional HTTP operations. */
  resource<T extends object>(props: SimApiResourceProps<T>): RestResource<T> {
    const { decode, itemPath, locate, operations, path, ...stateProps } = props;
    const restProps: RestResourceProps = {
      path,
      ...(decode === undefined ? {} : { decode }),
      ...(itemPath === undefined ? {} : { itemPath }),
      ...(locate === undefined ? {} : { locate }),
      ...(operations === undefined ? {} : { operations }),
    };
    return this.expose(new SimResource<T>(stateProps), restProps);
  }

  /** Exposes existing resource state through conventional HTTP operations. */
  expose<T extends object>(
    state: SimResource<T>,
    props: RestResourceProps,
  ): RestResource<T> {
    validateResourcePath(props.path);
    const pathShape = resourcePathShape(props.path);

    if (this.#paths.has(pathShape)) {
      throw new TypeError(
        `A resource is already exposed at collection path "${props.path}".`,
      );
    }

    const resource = new RestResource(state, this.#withApiDecode(props));
    attachRestResource(resource, (operation) => {
      this.#router.register(operation);
    });
    this.#paths.add(pathShape);
    return resource;
  }

  /** Adds a raw HTTP operation to this API. */
  operation(
    method: string,
    path: string,
    handle: RawHttpOperationHandler,
  ): RawHttpOperation {
    const built = rawOperation(method, path, handle);

    this.#router.register(built.http);
    return built.operation;
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
}
