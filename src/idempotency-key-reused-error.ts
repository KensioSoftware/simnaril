/** Reports an idempotency key reused for a different HTTP request. */
export class IdempotencyKeyReusedError extends Error {
  readonly headerName: string;
  readonly key: string;

  constructor(key: string, headerName = "Idempotency-Key") {
    super(
      `${headerName} value "${key}" has already been used for a different request.`,
    );
    this.name = "IdempotencyKeyReusedError";
    this.headerName = headerName;
    this.key = key;
  }
}
