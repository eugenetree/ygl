import { ZodError } from "zod";

type ConstructorValue =
  | string
  | ZodError
  | { message: string; error: ZodError };

const stringifyConstructorValue = (value: ConstructorValue) => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof ZodError) {
    return value.message;
  }

  return `${value.message}, ${JSON.stringify(value.error, null, 2)}`;
};

export class ValidationError extends Error {
  public name = "ValidationError";
  public error: ZodError | undefined;

  constructor(value: ConstructorValue) {
    super(stringifyConstructorValue(value));

    if (value instanceof ZodError) {
      this.error = value;
    }
  }
}
