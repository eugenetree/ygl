import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { escapeIdentifier } from "pg";

import { DatabaseClient } from "../client.js";
import { MIGRATIONS_FOLDER, migrateToLatest } from "../migrator.js";
import {
  publishTestServer,
  type ServerAddress,
  withAdminClient,
} from "./test-server.js";

// `npm run test:db:reset` finds the container by this label.
const CONTAINER_LABEL = "yg.test-postgres";

// Renaming onto a base another run just created fails with duplicate_database,
// or with unique_violation on pg_database when the two renames race.
const BASE_ALREADY_BUILT = new Set(["42P04", "23505"]);

// Naming the base database after the migrations lets a reused container serve
// any branch: a different set of migrations selects a different base instead of
// tripping Kysely's "corrupted migrations" check, and an edit in place is seen.
async function hashMigrations(): Promise<string> {
  const hash = createHash("sha256");
  for (const file of (await readdir(MIGRATIONS_FOLDER)).sort()) {
    hash.update(file);
    hash.update(await readFile(path.join(MIGRATIONS_FOLDER, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

async function ensureBaseDatabase(
  server: ServerAddress,
  name: string,
): Promise<void> {
  const exists = await withAdminClient(server, async (admin) => {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    return rowCount === 1;
  });
  if (exists) return;

  // Migrate under a temporary name and rename once complete, so an interrupted
  // or failed run never leaves a half-migrated base that later runs would reuse.
  const building = `${name}_building_${process.pid}`;
  await withAdminClient(server, (admin) =>
    admin.query(`CREATE DATABASE ${escapeIdentifier(building)}`),
  );
  try {
    const db = new DatabaseClient({ ...server, database: building });
    try {
      const { error } = await migrateToLatest(db);
      if (error) throw error;
    } finally {
      await db.destroy();
    }
    await withAdminClient(server, (admin) =>
      admin.query(
        `ALTER DATABASE ${escapeIdentifier(building)} RENAME TO ${escapeIdentifier(name)}`,
      ),
    );
  } catch (error) {
    await withAdminClient(server, (admin) =>
      admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(building)}`),
    );
    const code = (error as { code?: string }).code;
    if (code && BASE_ALREADY_BUILT.has(code)) return;
    throw error;
  }
}

export async function startTestServer(): Promise<void> {
  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withLabels({ [CONTAINER_LABEL]: "true" })
    .withReuse()
    .start();

  const server = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
  };
  const baseDatabase = `base_${await hashMigrations()}`;
  await ensureBaseDatabase(server, baseDatabase);

  publishTestServer({ ...server, baseDatabase });
}
