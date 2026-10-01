import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeSignature } from "better-auth/crypto";
import { getAuthTables } from "better-auth/db";
import { sql } from "kysely";

import { useTestDatabase } from "../../db/testing/test-database.js";
import { createAuth } from "./auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("better-auth on the migrated schema", () => {
  const db = useTestDatabase();
  const auth = createAuth(db, {
    secret: "test-secret-at-least-32-characters-long",
    apiPublicUrl: "http://localhost:3001",
    frontendOrigin: "http://localhost:3000",
    google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  });

  async function signInWithGoogle() {
    const ctx = await auth.$context;
    const { user } = await ctx.internalAdapter.createOAuthUser(
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        emailVerified: true,
        image: "https://example.com/ada.png",
      },
      {
        providerId: "google",
        accountId: "google-sub-123",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        idToken: "id-token",
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        scope: "openid,email,profile",
      },
    );
    const session = await ctx.internalAdapter.createSession(user.id);
    const cookie = `${ctx.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, ctx.secret)}`;
    return { user, session, headers: new Headers({ cookie }) };
  }

  it("finds the session again from its token, as the signed-in guard does", async () => {
    const { user, session, headers } = await signInWithGoogle();

    const found = await auth.api.getSession({ headers });

    assert.equal(found?.session.id, session.id);
    assert.equal(found?.user.id, user.id);
    assert.equal(found?.user.email, "ada@example.com");
  });

  it("stores the user, the Google account link and the session in our tables, keyed by UUID", async () => {
    const { user, session } = await signInWithGoogle();

    const { rows: users } = await sql<{ id: string; emailVerified: boolean }>`
      SELECT id, email_verified FROM users
    `.execute(db);
    const { rows: accounts } = await sql<{
      id: string;
      userId: string;
      providerId: string;
      accountId: string;
    }>`
      SELECT id, user_id, provider_id, account_id FROM accounts
    `.execute(db);
    const { rows: sessions } = await sql<{ id: string; userId: string }>`
      SELECT id, user_id FROM sessions WHERE token = ${session.token}
    `.execute(db);

    assert.deepEqual(users, [{ id: user.id, emailVerified: true }]);
    assert.match(user.id, UUID);

    assert.equal(accounts.length, 1);
    assert.match(accounts[0].id, UUID);
    assert.equal(accounts[0].userId, user.id);
    assert.equal(accounts[0].providerId, "google");
    assert.equal(accounts[0].accountId, "google-sub-123");

    assert.equal(sessions.length, 1);
    assert.match(sessions[0].id, UUID);
    assert.equal(sessions[0].userId, user.id);
  });

  // better-auth checks its columns against the database before serving a
  // request, but not under tsx, which loads its core twice so the check
  // registers in one copy and is looked up in the other. Its migration diff
  // ignores the CamelCasePlugin. So ask for every column it declares here.
  it("finds every column better-auth declares, in snake_case", async () => {
    for (const table of Object.values(getAuthTables(auth.options))) {
      const columns = [
        "id",
        ...Object.entries(table.fields).map(
          ([name, field]) => field.fieldName ?? name,
        ),
      ];

      await assert.doesNotReject(
        sql`SELECT ${sql.join(columns.map((column) => sql.ref(column)))} FROM ${sql.table(table.modelName)} LIMIT 0`.execute(
          db,
        ),
        `${table.modelName} should have ${columns.join(", ")}`,
      );
    }
  });
});
