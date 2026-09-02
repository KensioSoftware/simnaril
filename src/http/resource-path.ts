/**
 * Checks that a resource path names a collection and nothing else.
 *
 * A path with a parameter, a query string or a fragment cannot be joined to
 * `/:id` to make an item route, and a path URL parsing would rewrite makes the
 * routes registered disagree with the string the caller passed.
 *
 * Anything but a canonical collection path throws a `TypeError` naming what
 * was received.
 */
export function validateResourcePath(path: string): void {
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
