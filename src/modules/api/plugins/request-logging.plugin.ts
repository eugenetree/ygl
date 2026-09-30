import fp from "fastify-plugin";

import type { Logger } from "../../_common/logger/logger.js";

export const requestLoggingPlugin = fp<{ logger: Logger }>(
  async (app, { logger }) => {
    app.addHook("onResponse", async (request, reply) => {
      const route = request.routeOptions.url ?? request.url.split("?")[0];
      logger.info(
        `${request.method} ${route} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms ${request.ip}`,
      );
    });
  },
);
