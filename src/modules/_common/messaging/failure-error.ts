import type { BaseError } from "../errors.js";

/**
 * pg-boss only fails a run, or retries an event, when its handler throws, so a
 * handler's `Failure` becomes this error.
 */
export function failureError(failure: BaseError): Error {
  const cause =
    failure.error instanceof Error ? `: ${failure.error.message}` : "";
  return new Error(`${failure.type}${cause}`, { cause: failure });
}
