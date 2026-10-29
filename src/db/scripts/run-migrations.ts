import { installMessagingSchema } from "../../modules/_common/messaging/messaging-schema.js";
import { connectionConfigFromEnv, dbClient } from "../client.js";
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

  try {
    await installMessagingSchema(connectionConfigFromEnv());
    console.log("task schema is up to date");
  } catch (error) {
    console.error("failed to install the task schema");
    console.error(error);
    process.exit(1);
  }
}

runMigrations();
