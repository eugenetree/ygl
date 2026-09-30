import { randomUUID } from "node:crypto";
import { after, before, beforeEach } from "node:test";
import {
  DEFAULT_MIGRATION_LOCK_TABLE,
  DEFAULT_MIGRATION_TABLE,
  type RawBuilder,
  sql,
} from "kysely";
import { escapeIdentifier } from "pg";

import { DatabaseClient } from "../client.js";
import { readTestServer, withAdminClient } from "./test-server.js";

/**
 * Call at the top of a test file or `describe`: it registers that suite's
 * hooks, and the returned client connects lazily, once its database exists.
 */
export function useTestDatabase(): DatabaseClient {
  const { baseDatabase, ...server } = readTestServer();
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const db = new DatabaseClient({ ...server, database: name });
  let truncateAll: RawBuilder<unknown> | undefined;

  before(async () => {
    await withAdminClient(server, (admin) =>
      admin.query(
        `CREATE DATABASE ${escapeIdentifier(name)} TEMPLATE ${escapeIdentifier(baseDatabase)}`,
      ),
    );

    const { rows } = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN (${DEFAULT_MIGRATION_TABLE}, ${DEFAULT_MIGRATION_LOCK_TABLE})
    `.execute(db);
    if (rows.length > 0) {
      const tables = rows.map((row) => escapeIdentifier(row.tablename));
      truncateAll = sql.raw(
        `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
  });

  beforeEach(async () => {
    await truncateAll?.execute(db);
  });

  after(async () => {
    await db.destroy();
    // Not WITH (FORCE): destroy() resolves before the pool's backends have
    // exited, and forcing kills them mid-exit, which the file sees as an
    // uncaught error. A plain drop waits for them.
    await withAdminClient(server, (admin) =>
      admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(name)}`),
    );
  });

  return db;
}
