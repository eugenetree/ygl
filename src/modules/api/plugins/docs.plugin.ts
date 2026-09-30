import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export const docsPlugin = fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      info: { title: "saythis.cc API", version: "1.0.0" },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });
});
