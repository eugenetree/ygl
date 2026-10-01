import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/types.js";
import { type AuthSettings, createAuth } from "../auth.js";

export const TEST_AUTH_SETTINGS = {
  secret: randomBytes(32).toString("base64"),
  publicOrigin: "https://saythis.co",
  google: { clientId: "google-client-id", clientSecret: "google-secret" },
} satisfies AuthSettings;

export function createTestAuth(db: Kysely<Database>) {
  return createAuth(db, TEST_AUTH_SETTINGS);
}
