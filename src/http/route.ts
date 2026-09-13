export interface RouteMatch {
  params: Readonly<Record<string, string>>;
}

export interface CompiledRoute {
  match: (pathname: string) => RouteMatch | undefined;
  specificity: number;
}

/** Compiles an absolute path template with named parameters. */
export function compileRoute(
  path: string,
  requiredParameters: readonly string[] = [],
): CompiledRoute {
  validateOperationPath(path);
  const segments = path === "/" ? [] : path.slice(1).split("/");
  const parameterNames = new Set<string>();
  const parameters = new Map<string, { name: string; suffix: string }>();
  let suffixLength = 0;

  for (const segment of segments) {
    if (!segment.startsWith(":")) {
      continue;
    }

    const parsed = /^:([A-Za-z_][A-Za-z\d_]*)(:[A-Za-z_][A-Za-z\d_]*)?$/u.exec(
      segment,
    );
    const name = parsed?.[1];

    if (name === undefined) {
      throw new TypeError(
        `Expected a named path parameter such as ":id", received "${segment}".`,
      );
    }

    if (parameterNames.has(name)) {
      throw new TypeError(`Path parameter ":${name}" appears more than once.`);
    }

    const suffix = parsed?.[2] ?? "";
    parameterNames.add(name);
    parameters.set(segment, { name, suffix });
    suffixLength += suffix.length;
  }

  for (const name of requiredParameters) {
    if (!parameterNames.has(name)) {
      throw new TypeError(
        `Operation path "${path}" must include path parameter ":${name}".`,
      );
    }
  }

  const literalSegments = segments.filter(
    (segment) => !parameters.has(segment),
  );

  return {
    specificity:
      literalSegments.length * 1_000_000 +
      segments.length * 1000 +
      literalSegments.join("/").length +
      suffixLength,
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

        const parameter = parameters.get(segment);

        if (parameter === undefined) {
          if (candidate !== segment) {
            return undefined;
          }
          continue;
        }

        if (
          !candidate.endsWith(parameter.suffix) ||
          candidate.length <= parameter.suffix.length
        ) {
          return undefined;
        }

        try {
          params[parameter.name] = decodeURIComponent(
            candidate.slice(0, candidate.length - parameter.suffix.length),
          );
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
