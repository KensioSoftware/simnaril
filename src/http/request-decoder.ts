/**
 * Reads a request body into the input a semantic operation receives.
 *
 * JSON is the default and stays the default. A decoder is supplied for the
 * services that speak something else on the way in. Stripe, Rails and PHP
 * applications all take `application/x-www-form-urlencoded` and answer with
 * JSON, and simulating one takes this hook.
 *
 * A decoder is only ever asked for a body by an operation that has one to read.
 * `GET` and `DELETE` inherit none, whatever is configured above them.
 */
export type RequestDecoder = (request: Request) => unknown;

/** The default decoder, and what an operation uses when none is supplied. */
export const decodeJson: RequestDecoder = (request) => request.json();

/**
 * Runs a decoder only when the request arrived with a body.
 *
 * An operation that may be called either way asks for this. Handing the
 * decoder a request with no body is how `decodeJson` comes to answer
 * `Unexpected end of JSON input` for a `DELETE` that was sent nothing.
 */
export const decodeWhenPresent =
  (decode: RequestDecoder): RequestDecoder =>
  (request) =>
    request.body === null ? undefined : decode(request);
