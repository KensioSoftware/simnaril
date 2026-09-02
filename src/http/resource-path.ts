/**
 * Checks that a resource path names a collection and nothing else.
 *
 * A query string or fragment does not belong to a collection path. URL
 * normalization can also make the registered route differ from the string the
 * caller passed. Named parameters are allowed because collections often belong
 * to another resource.
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
    !/^\/(?:[^/:]+|:[A-Za-z_][A-Za-z\d_]*)(?:\/(?:[^/:]+|:[A-Za-z_][A-Za-z\d_]*))*$/u.test(
      path,
    )
  ) {
    throw new TypeError(
      `Expected a resource collection path such as "/widgets", received "${path}".`,
    );
  }
}
