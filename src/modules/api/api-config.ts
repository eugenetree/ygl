import type { ServiceIdentifier } from "inversify";
import { z } from "zod";

import type { DatabaseConnectionConfig } from "../../db/client.js";

const setting = () =>
  z.string({ required_error: "is not set" }).min(1, "is not set");

const origin = (example: string) =>
  setting().refine(
    (value) => URL.canParse(value) && new URL(value).origin === value,
    `must be an origin such as ${example}, with no path or trailing slash`,
  );

const port = () => setting().pipe(z.coerce.number().int().min(1).max(65535));

const envSchema = z.object({
  API_PORT: port(),
  PUBLIC_ORIGIN: origin("https://saythis.co"),
  ES_NODE: setting().url(),
  BETTER_AUTH_SECRET: setting().min(
    32,
    "must be at least 32 characters, such as the output of `openssl rand -base64 32`",
  ),
  GOOGLE_CLIENT_ID: setting(),
  GOOGLE_CLIENT_SECRET: setting(),
  DB_HOST: setting(),
  DB_PORT: port(),
  POSTGRES_DB: setting(),
  POSTGRES_USER: setting(),
  POSTGRES_PASSWORD: setting(),
});

export type ApiConfig = {
  port: number;
  publicOrigin: string;
  esNode: string;
  authSecret: string;
  google: { clientId: string; clientSecret: string };
  database: DatabaseConnectionConfig;
};

export const API_CONFIG: ServiceIdentifier<ApiConfig> = Symbol.for("ApiConfig");

export function parseApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid API configuration:\n${problems}`);
  }

  const { data } = parsed;
  return {
    port: data.API_PORT,
    publicOrigin: data.PUBLIC_ORIGIN,
    esNode: data.ES_NODE,
    authSecret: data.BETTER_AUTH_SECRET,
    google: {
      clientId: data.GOOGLE_CLIENT_ID,
      clientSecret: data.GOOGLE_CLIENT_SECRET,
    },
    database: {
      host: data.DB_HOST,
      port: data.DB_PORT,
      database: data.POSTGRES_DB,
      user: data.POSTGRES_USER,
      password: data.POSTGRES_PASSWORD,
    },
  };
}
