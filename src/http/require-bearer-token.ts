import { BearerTokenError } from "../bearer-token-error.js";
import type { ErrorFormatter } from "./error-formatter.js";
import type { HttpMiddleware } from "./operation.js";

/** Configures bearer authentication for the operations using this middleware. */
export interface RequireBearerTokenProps {
  /** The exact, case-sensitive token accepted by this simulated service. */
  token: string;
  /** Formats a refusal. Returning undefined leaves it to the API's error handling. */
  formatError?: ErrorFormatter;
}

/** Requires the configured bearer token before running an operation. */
export function requireBearerToken(
  props: RequireBearerTokenProps,
): HttpMiddleware {
  const { token, formatError } = props;

  return ({ request }, next) => {
    const authorization = request.headers.get("authorization");
    // RFC 6750 section 2.1 permits ASCII token characters and one or more spaces.
    // https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1
    const credentials = /^([A-Za-z]+) +([A-Za-z\d._~+/-]+=*)$/u.exec(
      authorization ?? "",
    );
    const suppliedToken =
      credentials?.[1]?.toLowerCase() === "bearer" ? credentials[2] : undefined;

    if (suppliedToken !== undefined && suppliedToken === token) {
      return next();
    }

    const error = new BearerTokenError(
      authorization === null
        ? "missing"
        : suppliedToken === undefined
          ? "malformed"
          : "mismatch",
    );
    const formatted = formatError?.(error);

    if (formatted !== undefined) {
      return formatted;
    }

    throw error;
  };
}
