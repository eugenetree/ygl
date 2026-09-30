import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import type { Logger } from "../_common/logger/logger.js";
import type { HttpApp, HttpController } from "./http-controller.js";
import { corsPlugin } from "./plugins/cors.plugin.js";
import { errorsPlugin } from "./plugins/errors.plugin.js";
import { requestLoggingPlugin } from "./plugins/request-logging.plugin.js";

export function buildHttpServer({
  logger,
  frontendOrigin,
  controllers,
}: {
  logger: Logger;
  frontendOrigin: string;
  controllers: HttpController[];
}): HttpApp {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(requestLoggingPlugin, { logger });
  app.register(corsPlugin, { frontendOrigin });
  app.register(errorsPlugin, { logger });

  app.register(async (scope) => {
    for (const controller of controllers) {
      controller.register(scope);
    }
  });

  return app;
}
