/**
 * Scaffolding. The first real simulation should replace what is in here.
 *
 * Both of the things below are already written down in AGENTS.md. They are
 * here to give the build, the lint, the tests and the packed tarball something
 * to work on from the first commit.
 */

/**
 * A simulated service, seen from the protocol boundary.
 *
 * Everything a simulator is for sits behind this. HTTP is one interface onto a
 * simulated world, and this is the shape of that interface.
 */
export interface SimService {
  handle: (request: Request) => Promise<Response>;
}

/**
 * What a simulator says when a request reaches it and nothing in it handles
 * the request.
 *
 * Error text is part of the public API here. A developer who reads this should
 * come away knowing which simulator took the request, what the request was,
 * and what the simulator is missing.
 */
export function unhandledRequest(service: string, request: Request): string {
  const { method } = request;
  const { pathname } = new URL(request.url);

  return (
    `${method} ${request.url} reached ${service}, ` +
    `but ${service} has no handler for ${method} ${pathname}.`
  );
}
