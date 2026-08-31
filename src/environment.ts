import {
  interceptHttpRequests,
  type HttpInterception,
} from "./http/interception.js";

const activeOrigins = new Set<string>();

/** Handles HTTP requests for one simulated service. */
export interface SimService {
  handle: (request: Request) => Promise<Response> | Response;
}

/** Routes HTTP requests to the simulated services registered with it. */
export class SimEnvironment implements Disposable {
  readonly #services = new Map<string, SimService>();
  #disposed = false;
  #interception: HttpInterception | undefined;

  /** Registers a simulated service for every request to an HTTP origin. */
  register(origin: string | URL, service: SimService): void {
    const normalizedOrigin = this.#normalizeOrigin(origin);

    if (this.#disposed) {
      throw new Error(
        `Cannot register ${normalizedOrigin} with a disposed SimEnvironment.`,
      );
    }

    if (this.#services.has(normalizedOrigin)) {
      throw new Error(
        `A simulated service is already registered for ${normalizedOrigin}.`,
      );
    }

    if (activeOrigins.has(normalizedOrigin)) {
      throw new Error(
        `Another active SimEnvironment is already registered for ${normalizedOrigin}.`,
      );
    }

    this.#interception ??= interceptHttpRequests((request) =>
      this.#handle(request),
    );
    this.#services.set(normalizedOrigin, service);
    activeOrigins.add(normalizedOrigin);
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
    this.#interception?.dispose();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  #handle(request: Request): Promise<Response> | Response | undefined {
    const origin = new URL(request.url).origin;
    return this.#services.get(origin)?.handle(request);
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
