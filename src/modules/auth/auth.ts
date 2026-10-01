import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";

export type AuthSettings = {
  secret: string;
  apiPublicUrl: string;
  frontendOrigin: string;
  google: { clientId: string; clientSecret: string };
};

// Given our Kysely instance so its CamelCasePlugin maps better-auth's fields to
// snake_case columns, as it does for every other table (ADR-0005).
export function createAuth(db: Kysely<Database>, settings: AuthSettings) {
  return betterAuth({
    database: { db, type: "postgres" },
    secret: settings.secret,
    baseURL: settings.apiPublicUrl,
    trustedOrigins: [settings.frontendOrigin],
    socialProviders: {
      google: {
        clientId: settings.google.clientId,
        clientSecret: settings.google.clientSecret,
      },
    },
    emailAndPassword: { enabled: false },
    user: { modelName: "users", deleteUser: { enabled: true } },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    advanced: {
      database: { generateId: () => randomUUID() },
      useSecureCookies: new URL(settings.apiPublicUrl).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type User = Auth["$Infer"]["Session"]["user"];
