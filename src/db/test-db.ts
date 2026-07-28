import fs from "fs/promises";
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
  sql,
} from "kysely";
import * as path from "path";
import pg from "pg";

import { Database } from "./types.js";

/**
 * Test database access.
 *
 * Tests run against a real Postgres — pg-mem silently mis-evaluates aggregate
 * FILTER clauses (it drops the filter and returns a bare count), which is
 * exactly the SQL the priority listing depends on.
 *
 * The target database is deliberately separate from the development one so a
 * test run can never truncate real data.
 */

const TEST_DB_NAME = process.env.TEST_POSTGRES_DB ?? "saythis_test";

const connection = {
  host: process.env.TEST_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.TEST_DB_PORT ?? 5432),
  user: process.env.TEST_POSTGRES_USER ?? "admin",
  password: process.env.TEST_POSTGRES_PASSWORD ?? "admin",
};

const DEV_DB_NAMES = ["saythis", "postgres"];

if (DEV_DB_NAMES.includes(TEST_DB_NAME)) {
  throw new Error(
    `Refusing to run tests against "${TEST_DB_NAME}" — it is a development database.`,
  );
}

let migrated = false;

async function ensureDatabaseExists(): Promise<void> {
  const admin = new pg.Client({ ...connection, database: "postgres" });
  await admin.connect();
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME],
    );
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await admin.end();
  }
}

async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    // biome-ignore lint/suspicious/noExplicitAny: Migrator's signature demands Kysely<any>
    db: db as unknown as Kysely<any>,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

/**
 * Connects to the test database, creating and migrating it on first use.
 * Callers are responsible for calling `destroy()` when finished.
 */
export async function createTestDb(): Promise<Kysely<Database>> {
  await ensureDatabaseExists();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ ...connection, database: TEST_DB_NAME, max: 5 }),
    }),
    plugins: [new CamelCasePlugin()],
  });

  if (!migrated) {
    await migrateToLatest(db);
    migrated = true;
  }

  return db;
}

/**
 * Empties every application table, leaving the migration bookkeeping intact.
 */
export async function truncateAll(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE 'kysely_%'
  `.execute(db);

  if (rows.length === 0) return;

  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  await sql
    .raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
    .execute(db);
}
