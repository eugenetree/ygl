import { setTimeout as sleep } from "node:timers/promises";
import { getConstructionPlans, PgBoss } from "pg-boss";

import type { DatabaseConnectionConfig } from "../../../db/client.js";

const SCHEMA_UPGRADE_POLL_MS = 1_000;

/**
 * Installs pg-boss's schema, or upgrades it to this pg-boss version. Only the
 * migrate step calls it: every `MessagingConnection` refuses to start on a
 * mismatched schema.
 */
export async function installMessagingSchema(
  connection: DatabaseConnectionConfig,
): Promise<void> {
  const boss = new PgBoss({
    ...connection,
    migrate: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
  });
  await boss.start();
  try {
    // An upgrade can leave index builds for a background worker that only runs
    // while a migrating instance is alive, so wait for them before stopping.
    while (
      (await boss.getBamStatus()).some(
        ({ status, count }) =>
          (status === "pending" || status === "in_progress") && count > 0,
      )
    ) {
      await sleep(SCHEMA_UPGRADE_POLL_MS);
    }
  } finally {
    await boss.stop();
  }
}

/** Changes whenever the schema `installMessagingSchema` installs does. */
export function messagingSchemaDefinition(): string {
  return getConstructionPlans();
}
