/** Reports missing, malformed or unexpected bearer credentials. */
export class BearerTokenError extends Error {
  readonly reason: "missing" | "malformed" | "mismatch";

  constructor(reason: BearerTokenError["reason"]) {
    const messages = {
      missing: "An Authorization header with a bearer token is required.",
      malformed:
        "Expected an Authorization header containing one bearer token.",
      mismatch: "The bearer token does not match the expected token.",
    };

    super(messages[reason]);
    this.name = "BearerTokenError";
    this.reason = reason;
  }
}
