export interface RouteMatch {
  params: Readonly<Record<string, string>>;
}

export interface CompiledRoute {
  match: (pathname: string) => RouteMatch | undefined;
  specificity: number;
}

/** Compiles an absolute path template with named parameters. */
export function compileRoute(path: string): CompiledRoute {
  validateOperationPath(path);
  const segments = path === "/" ? [] : path.slice(1).split("/");
  const parameterNames = new Set<string>();

  for (const segment of segments) {
    if (!segment.startsWith(":")) {
      continue;
    }

    const name = segment.slice(1);

    if (!/^[A-Za-z_][A-Za-z\d_]*$/u.test(name)) {
      throw new TypeError(
        `Expected a named path parameter such as ":id", received "${segment}".`,
      );
    }

    if (parameterNames.has(name)) {
      throw new TypeError(`Path parameter ":${name}" appears more than once.`);
    }

    parameterNames.add(name);
  }

  const literalSegments = segments.filter(
    (segment) => !segment.startsWith(":"),
  ).length;
  const literalLength = segments
    .filter((segment) => !segment.startsWith(":"))
    .join("/").length;

  return {
    specificity:
      literalSegments * 1_000_000 + segments.length * 1000 + literalLength,
    match: (pathname): RouteMatch | undefined => {
      const candidateSegments =
        pathname === "/" ? [] : pathname.slice(1).split("/");

      if (candidateSegments.length !== segments.length) {
        return undefined;
      }

      const params: Record<string, string> = {};

      for (const [index, segment] of segments.entries()) {
        const candidate = candidateSegments[index] ?? "";

        if (candidate.length === 0) {
          return undefined;
        }

        if (!segment.startsWith(":")) {
          if (candidate !== segment) {
            return undefined;
          }
          continue;
        }

        try {
          params[segment.slice(1)] = decodeURIComponent(candidate);
        } catch {
          return undefined;
        }
      }

      return { params };
    },
  };
}

/** Validates an absolute operation path or path template. */
export function validateOperationPath(path: string): void {
  const base = new URL("https://simnaril.invalid");
  const url = new URL(path, base);

  if (
    url.origin !== base.origin ||
    url.pathname !== path ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^\/(?:[^/]+(?:\/[^/]+)*)?$/u.test(path)
  ) {
    throw new TypeError(
      `Expected an absolute operation path such as "/widgets/:id", received "${path}".`,
    );
  }
}

/** Normalizes and validates one HTTP method. */
export function normalizeMethod(method: string): string {
  if (!/^[!#$%&'*+\-.^_`|~A-Za-z\d]+$/u.test(method)) {
    throw new TypeError(`Expected an HTTP method, received "${method}".`);
  }

  return method.toUpperCase();
}
