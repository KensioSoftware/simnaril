/** Reports a request for which a simulated API has no operation. */
export class UnimplementedRouteError extends Error {
  readonly method: string;
  readonly pathname: string;
  readonly url: string;

  constructor(request: Request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    super(
      `${method} ${request.url} reached SimApi, but SimApi has no handler for ${method} ${url.pathname}.`,
    );
    this.name = "UnimplementedRouteError";
    this.method = method;
    this.pathname = url.pathname;
    this.url = request.url;
  }
}
