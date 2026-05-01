import fs from "fs/promises";
import { FileMigrationProvider, Kysely, Migrator } from "kysely";
import * as path from "path";

import { dbClient } from "../client.js";

async function rollbackMigration() {
  const migrator = new Migrator({
    db: dbClient as unknown as Kysely<any>,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "../migrations"),
    }),
  });

  const { error, results } = await migrator.migrateDown();

  if (error) {
    console.error("failed to rollback");
    console.error(error);
    process.exit(1);
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(
        `migration "${it.migrationName}" was rolled back successfully`,
      );
    } else if (it.status === "Error") {
      console.error(`failed to rollback migration "${it.migrationName}"`);
    }
  });

  await dbClient.destroy();
}

rollbackMigration();
