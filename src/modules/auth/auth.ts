import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { openAPI } from "better-auth/plugins";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";

export type AuthSettings = {
  secret: string;
  publicOrigin: string;
  google: { clientId: string; clientSecret: string };
};

// better-auth serves every route it has whatever its options, refusing at
// request time the ones they leave off. Disabled, these answer 404 and are left
// out of the OpenAPI document. They are everything but Google sign-in, the
// session, sign-out, account deletion and the page OAuth errors land on.
const DISABLED_PATHS = [
  // Served with ours under /api/docs.
  "/open-api/generate-schema",
  "/reference",
  // Email and password, and everything that needs an email sent.
  "/sign-up/email",
  "/sign-in/email",
  "/verify-password",
  "/change-password",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/send-verification-email",
  "/verify-email",
  "/change-email",
  "/delete-user/callback",
  // Profiles are Google's, and Google is the only account a user has.
  "/update-user",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/refresh-token",
  "/get-access-token",
  // Listeners don't manage sessions: signing out ends one, deleting ends all.
  "/update-session",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  // A health check, which the API does not offer.
  "/ok",
];

// Given our Kysely instance so its CamelCasePlugin maps better-auth's fields to
// snake_case columns, as it does for every other table (ADR-0005).
export function createAuth(db: Kysely<Database>, settings: AuthSettings) {
  return betterAuth({
    database: { db, type: "postgres" },
    secret: settings.secret,
    baseURL: settings.publicOrigin,
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
      useSecureCookies: new URL(settings.publicOrigin).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    plugins: [openAPI()],
    disabledPaths: DISABLED_PATHS,
    hooks: {
      // disabledPaths is matched against the requested path as it is, so a path
      // with a parameter in it is refused here, by the route it reaches.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/reset-password/:token") {
          throw new APIError("NOT_FOUND");
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type User = Auth["$Infer"]["Session"]["user"];
