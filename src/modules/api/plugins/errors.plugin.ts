import fp from "fastify-plugin";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

import type { Logger } from "../../_common/logger/logger.js";
import type { ErrorResponse } from "../contract/index.js";
import { RouteFailure } from "../route-failure.js";

export const errorsPlugin = fp<{ logger: Logger }>(async (app, { logger }) => {
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: "NOT_FOUND",
      message: `No route matches ${request.method} ${request.url.split("?")[0]}`,
    } satisfies ErrorResponse),
  );

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map(({ params: { issue } }) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: issues
          .map(({ field, message }) => `${field}: ${message}`)
          .join("; "),
        issues,
      } satisfies ErrorResponse);
    }

    if (error instanceof RouteFailure) {
      logger.error({
        message: `Request failed with ${error.failure.type}`,
        error: error.failure.error,
      });
      const { status, body } = error.response;
      return reply.code(status).send(body);
    }

    logger.error({
      message: `Unexpected error in ${request.method} ${request.url}`,
      error,
    });
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side.",
    } satisfies ErrorResponse);
  });
});
