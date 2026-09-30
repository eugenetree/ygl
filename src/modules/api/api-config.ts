import type { ServiceIdentifier } from "inversify";
import { z } from "zod";

const setting = () =>
  z.string({ required_error: "is not set" }).min(1, "is not set");

const envSchema = z.object({
  API_PORT: setting().pipe(z.coerce.number().int().min(1).max(65535)),
  FRONTEND_ORIGIN: setting().refine(
    (value) => URL.canParse(value) && new URL(value).origin === value,
    "must be an origin such as https://saythis.cc, with no path or trailing slash",
  ),
  ES_NODE: setting().url(),
});

export type ApiConfig = {
  port: number;
  frontendOrigin: string;
  esNode: string;
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

  return {
    port: parsed.data.API_PORT,
    frontendOrigin: parsed.data.FRONTEND_ORIGIN,
    esNode: parsed.data.ES_NODE,
  };
}
