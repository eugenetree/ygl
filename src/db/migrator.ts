import fs from "node:fs/promises";
import * as path from "node:path";
import {
  FileMigrationProvider,
  type Kysely,
  type MigrationResultSet,
  Migrator,
} from "kysely";

export const MIGRATIONS_FOLDER = path.join(__dirname, "migrations");

function createMigrator<DB>(db: Kysely<DB>): Migrator {
  return new Migrator({
    // Migrations are written against Kysely<any>, which a Kysely<DB> is not
    // assignable to.
    db: db as unknown as Kysely<any>,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATIONS_FOLDER,
    }),
  });
}

export function migrateToLatest<DB>(
  db: Kysely<DB>,
): Promise<MigrationResultSet> {
  return createMigrator(db).migrateToLatest();
}

export function migrateDown<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return createMigrator(db).migrateDown();
}
