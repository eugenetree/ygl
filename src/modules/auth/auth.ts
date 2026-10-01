import { randomUUID } from "node:crypto";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";
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
  const options = {
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
    plugins: [openAPI()],
  } satisfies BetterAuthOptions;
  return betterAuth({ ...options, disabledPaths: pathsLeftOff(options) });
}

// better-auth serves every route whatever its options, refusing at request time
// the ones they leave off. Disabled, they answer 404 and are left out of the
// OpenAPI document.
function pathsLeftOff(options: BetterAuthOptions) {
  return [
    // The document is served with ours under /api/docs.
    "/open-api/generate-schema",
    "/reference",
    ...(options.emailAndPassword?.enabled
      ? []
      : [
          "/sign-up/email",
          "/sign-in/email",
          "/verify-password",
          "/change-password",
          "/request-password-reset",
          "/reset-password",
          "/reset-password/:token",
        ]),
    ...(options.emailVerification?.sendVerificationEmail
      ? []
      : ["/send-verification-email", "/verify-email"]),
    ...(options.user?.changeEmail?.enabled ? [] : ["/change-email"]),
    ...(options.user?.deleteUser?.enabled
      ? []
      : ["/delete-user", "/delete-user/callback"]),
  ];
}

export type Auth = ReturnType<typeof createAuth>;
export type User = Auth["$Infer"]["Session"]["user"];
