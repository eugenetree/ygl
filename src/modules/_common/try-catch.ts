import { Failure, Result, Success } from "../../types/index.js";

export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return Success(data);
  } catch (error) {
    return Failure(error as E);
  }
}
