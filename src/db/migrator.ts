import fs from "node:fs/promises";
import * as path from "node:path";
import {
  FileMigrationProvider,
  type Kysely,
  type MigrationResultSet,
  Migrator,
} from "kysely";

import type { Database } from "./types.js";

export const MIGRATIONS_FOLDER = path.join(__dirname, "migrations");

function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    // Migrations are written against Kysely<any>, which a Kysely<Database> is
    // not assignable to.
    db: db as unknown as Kysely<any>,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATIONS_FOLDER,
    }),
  });
}

export function migrateToLatest(
  db: Kysely<Database>,
): Promise<MigrationResultSet> {
  return createMigrator(db).migrateToLatest();
}

export function migrateDown(db: Kysely<Database>): Promise<MigrationResultSet> {
  return createMigrator(db).migrateDown();
}
