export type Success<T> = { ok: true; value: T };
export type Failure<T> = { ok: false; error: T };
export type Result<Value, Error> = Success<Value> | Failure<Error>;

export const Success = <T>(value: T): Success<T> => ({ ok: true, value });
export const Failure = <T>(error: T): Failure<T> => ({ ok: false, error });
