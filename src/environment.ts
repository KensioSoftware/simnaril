import {
  interceptHttpRequests,
  type HttpInterception,
} from "./http/interception.js";
import { UnclaimedOriginError } from "./unclaimed-origin-error.js";

const activeOrigins = new Map<string, SimEnvironment>();

/** Handles HTTP requests for one simulated service. */
export interface SimService {
  handle: (request: Request) => Promise<Response> | Response;
}

/** Selects what an environment does with requests outside every simulation. */
export type UnhandledRequestPolicy = "error" | "passthrough";

/** Configures a simulated environment. */
export interface SimEnvironmentProps {
  name?: string;
  unhandledRequest?: UnhandledRequestPolicy;
}

/** Routes HTTP requests to the simulated services registered with it. */
export class SimEnvironment implements Disposable {
  readonly #services = new Map<string, SimService>();
  readonly #interception: HttpInterception;
  readonly #name: string | undefined;
  readonly #unhandledRequest: UnhandledRequestPolicy;
  #disposed = false;

  constructor(props: SimEnvironmentProps = {}) {
    this.#name = props.name;
    this.#unhandledRequest = props.unhandledRequest ?? "error";
    this.#interception = interceptHttpRequests((request) =>
      this.#handle(request),
    );
  }

  /** Registers a simulated service for every request to an HTTP origin. */
  register(origin: string | URL, service: SimService): void {
    const normalizedOrigin = this.#normalizeOrigin(origin);

    if (this.#disposed) {
      throw new Error(
        `Cannot register ${normalizedOrigin} with a disposed ${this.#description()}.`,
      );
    }

    if (this.#services.has(normalizedOrigin)) {
      const environment =
        this.#name === undefined ? "" : ` in ${this.#description()}`;
      throw new Error(
        `A simulated service is already registered for ${normalizedOrigin}${environment}.`,
      );
    }

    const activeEnvironment = activeOrigins.get(normalizedOrigin);
    if (activeEnvironment !== undefined) {
      throw new Error(
        `Another active ${activeEnvironment.#description()} is already registered for ${normalizedOrigin}.`,
      );
    }

    this.#services.set(normalizedOrigin, service);
    activeOrigins.set(normalizedOrigin, this);
  }

  /** Stops this environment from intercepting requests. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    for (const origin of this.#services.keys()) {
      activeOrigins.delete(origin);
    }
    this.#services.clear();
    this.#interception.dispose();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  #handle(request: Request): Promise<Response> | Response | undefined {
    const origin = new URL(request.url).origin;
    const service = this.#services.get(origin);

    if (service !== undefined) {
      return service.handle(request);
    }

    if (activeOrigins.has(origin) || this.#unhandledRequest === "passthrough") {
      return undefined;
    }

    throw new UnclaimedOriginError(request, this.#name);
  }

  #description(): string {
    return this.#name === undefined
      ? "SimEnvironment"
      : `SimEnvironment (${this.#name})`;
  }

  #normalizeOrigin(origin: string | URL): string {
    const url = new URL(origin);
    const protocols = ["http:", "https:"];
    const isOrigin = url.href === `${url.origin}/`;

    if (!protocols.includes(url.protocol) || !isOrigin) {
      throw new TypeError(
        `Expected an HTTP origin, received ${origin.toString()}.`,
      );
    }

    return url.origin;
  }
}
