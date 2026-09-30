import proxyAddr from "@fastify/proxy-addr";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import type { Logger } from "../_common/logger/logger.js";
import type { HttpApp, HttpController } from "./http-controller.js";
import { corsPlugin } from "./plugins/cors.plugin.js";
import { docsPlugin } from "./plugins/docs.plugin.js";
import { errorsPlugin } from "./plugins/errors.plugin.js";
import { requestLoggingPlugin } from "./plugins/request-logging.plugin.js";

// Caddy reaches the API over the compose network and host-local callers through
// Docker's gateway, so a peer outside these ranges is a client reaching the API
// directly, whose X-Forwarded-* headers are its own to forge.
const isInternalAddress = proxyAddr.compile(["loopback", "uniquelocal"]);

export function buildHttpServer({
  logger,
  frontendOrigin,
  controllers,
}: {
  logger: Logger;
  frontendOrigin: string;
  controllers: HttpController[];
}): HttpApp {
  const app = Fastify({
    logger: false,
    trustProxy: (address, hop) => hop === 0 && isInternalAddress(address, hop),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(requestLoggingPlugin, { logger });
  app.register(corsPlugin, { frontendOrigin });
  app.register(errorsPlugin, { logger });
  // Before the controllers: swagger only documents routes added after it.
  app.register(docsPlugin);

  app.register(async (scope) => {
    for (const controller of controllers) {
      controller.register(scope);
    }
  });

  return app;
}
