import { ZodError, ZodType } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../logger/logger.js";
import { ValidationError } from "./errors.js";

/**
 * Validator class for handling Zod schema validation with enhanced error reporting
 */
export class Validator {
  private logger = new Logger({ context: Validator.name });

  public validate<T>(
    schema: ZodType<T>,
    data: unknown,
  ): Result<T, ValidationError> {
    try {
      const validated = schema.parse(data);
      return Success(validated);
    } catch (error) {
      if (error instanceof ZodError) {
        const enhancedError = {
          type: "VALIDATION_ERROR",
          cause: error,
          context: { data },
        } satisfies ValidationError;

        this.logger.error({ error: enhancedError });
        return Failure(enhancedError);
      }

      return Failure(
        {
          type: "VALIDATION_ERROR",
          cause: error,
        },
      );
    }
  }

  private stringifyZodError(error: ZodError, data: unknown): string {
    return error + "\n\n" + `Received data: ${JSON.stringify(data)}`;
  }
}

// Export a singleton instance for convenience
export const validator = new Validator();
