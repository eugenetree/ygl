import { dbClient } from "../client.js";
import { migrateToLatest } from "../migrator.js";

async function runMigrations() {
  const { error, results } = await migrateToLatest(dbClient);

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

runMigrations();
