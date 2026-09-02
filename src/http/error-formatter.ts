/**
 * Turns an error thrown by an operation into the response one API answers with.
 *
 * A real service has one error envelope across every endpoint. Stripe's is
 * `{ error: { type, code, message, param } }`, GitHub's is
 * `{ message, documentation_url }`, and simulating either takes describing the
 * shape once.
 *
 * Returning `undefined` declines the error and leaves it to the supplied
 * mappings, so a formatter can shape the errors it knows and ignore the rest.
 */
export type ErrorFormatter = (error: unknown) => Response | undefined;
