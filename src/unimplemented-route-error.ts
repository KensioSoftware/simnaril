/** Reports a request for which a simulated API has no operation. */
export class UnimplementedRouteError extends Error {
  readonly apiName: string;
  readonly method: string;
  readonly pathname: string;
  readonly url: string;

  constructor(request: Request, apiName = "SimApi") {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    super(
      `${method} ${request.url} reached ${apiName}, but ${apiName} has no handler for ${method} ${url.pathname}.`,
    );
    this.name = "UnimplementedRouteError";
    this.apiName = apiName;
    this.method = method;
    this.pathname = url.pathname;
    this.url = request.url;
  }
}
