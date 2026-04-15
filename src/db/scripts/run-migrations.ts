import fs from "fs/promises";
import { FileMigrationProvider, Migrator } from "kysely";
import * as path from "path";

import { dbClient } from "../client.js";

async function migrateToLatest() {
  const migrator = new Migrator({
    db: dbClient,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "../migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    console.error("failed to migrate");
    console.error(error);
    process.exit(1);
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  await dbClient.destroy();
}

migrateToLatest();
