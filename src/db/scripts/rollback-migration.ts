import { dbClient } from "../client.js";
import { migrateDown } from "../migrator.js";

async function rollbackMigration() {
  const { error, results } = await migrateDown(dbClient);

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
