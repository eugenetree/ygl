import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

import type { Auth } from "../../auth/auth.js";

type AuthDocument = Awaited<ReturnType<Auth["api"]["generateOpenAPISchema"]>>;

const SCHEMAS = "#/components/schemas/";

const signedIn = [{ session: [] }];
const optionallySignedIn = [{}, ...signedIn];

// better-auth's document marks every route as needing a bearer token, which this
// API does not accept, and does not say which need a session. Its other routes
// read the session cookie if there is one.
const AUTH_PATHS_NEEDING_SESSION = ["/delete-user"];

export const docsPlugin = fp<{ auth: Auth }>(async (app, { auth }) => {
  const authDocument = await auth.api.generateOpenAPISchema();
  const { authCookies } = await auth.$context;

  app.addHook("onRoute", (route) => {
    if ([route.preHandler].flat().includes(app.signedIn)) {
      route.schema = { ...route.schema, security: signedIn };
    }
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "saythis.co API", version: "1.0.0" },
      components: {
        securitySchemes: {
          session: {
            type: "apiKey",
            in: "cookie",
            name: authCookies.sessionToken.name,
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (document) => {
      if (!("openapiObject" in document)) {
        throw new Error("Expected an OpenAPI document");
      }
      const ours = document.openapiObject;
      const { paths, schemas } = adaptAuthDocument(authDocument);
      return {
        ...ours,
        paths: { ...ours.paths, ...paths },
        components: {
          ...ours.components,
          schemas: { ...ours.components?.schemas, ...schemas },
        },
      };
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });
});

// better-auth documents its paths relative to its own base path, and names its
// schemas plainly (User, Session), so they are prefixed to keep clear of ours.
function adaptAuthDocument(document: AuthDocument) {
  const basePath = new URL(document.servers[0].url).pathname;
  const renamed = (name: string) => `Auth${name}`;

  // Its schemas are OpenAPI 3.1, ours 3.0. The only 3.1 it uses are nullable
  // types and propertyNames, which only ever says keys are strings.
  const toOpenApi30 = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(toOpenApi30);
    if (value === null || typeof value !== "object") return value;
    const { propertyNames: _, ...schema } = value as Record<string, unknown>;
    if (Array.isArray(schema.type) && schema.type.includes("null")) {
      const [type] = schema.type.filter((type) => type !== "null");
      Object.assign(schema, { type, nullable: true });
    }
    if (typeof schema.$ref === "string" && schema.$ref.startsWith(SCHEMAS)) {
      schema.$ref = SCHEMAS + renamed(schema.$ref.slice(SCHEMAS.length));
    }
    return Object.fromEntries(
      Object.entries(schema).map(([key, entry]) => [key, toOpenApi30(entry)]),
    );
  };

  return {
    paths: Object.fromEntries(
      Object.entries(document.paths).map(([path, item]) => [
        basePath + path,
        Object.fromEntries(
          Object.entries(item).map(([method, operation]) => [
            method,
            {
              ...(toOpenApi30(operation) as object),
              security: AUTH_PATHS_NEEDING_SESSION.includes(path)
                ? signedIn
                : optionallySignedIn,
            },
          ]),
        ),
      ]),
    ),
    schemas: Object.fromEntries(
      Object.entries(document.components.schemas).map(([name, schema]) => [
        renamed(name),
        toOpenApi30(schema),
      ]),
    ),
  };
}
