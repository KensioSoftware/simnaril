/** Reports a request whose origin has no registered simulated service. */
export class UnclaimedOriginError extends Error {
  readonly method: string;
  readonly origin: string;
  readonly url: string;

  constructor(request: Request, environmentName?: string) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const environment =
      environmentName === undefined
        ? "SimEnvironment"
        : `SimEnvironment (${environmentName})`;

    super(
      `${method} ${request.url} reached ${environment}, but no simulated service is registered for origin ${url.origin}.`,
    );
    this.name = "UnclaimedOriginError";
    this.method = method;
    this.origin = url.origin;
    this.url = request.url;
  }
}
