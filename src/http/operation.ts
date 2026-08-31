export interface RouteMatch {
  identity?: string;
}

export interface HttpOperation {
  decode: (request: Request) => Promise<unknown>;
  encode: (output: unknown) => Promise<Response> | Response;
  match: (pathname: string) => RouteMatch | undefined;
  method: string;
  operate: (input: unknown, match: RouteMatch) => unknown;
  transform: (decoded: unknown, match: RouteMatch) => unknown;
}

export const matchCollection =
  (path: string) =>
  (pathname: string): RouteMatch | undefined =>
    pathname === path ? {} : undefined;

export const matchItem =
  (path: string) =>
  (pathname: string): RouteMatch | undefined => {
    const prefix = `${path}/`;

    if (!pathname.startsWith(prefix)) {
      return undefined;
    }

    const encodedIdentity = pathname.slice(prefix.length);

    if (encodedIdentity.length === 0 || encodedIdentity.includes("/")) {
      return undefined;
    }

    return { identity: decodeURIComponent(encodedIdentity) };
  };

/** Runs the protocol and semantic steps for a matched HTTP operation. */
export async function runHttpOperation(
  operation: HttpOperation,
  request: Request,
  match: RouteMatch,
): Promise<Response> {
  const decoded = await operation.decode(request);
  const input = await operation.transform(decoded, match);
  const output = await operation.operate(input, match);
  return operation.encode(output);
}
