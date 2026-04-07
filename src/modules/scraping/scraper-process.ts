import { injectable } from "inversify";

import { dbClient } from "../../db/client.js";
import {
  DatabaseError,
  ScraperControlSelectable,
} from "../../db/types.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";

/**
 * Bot-side handle to the scraper process. Concrete class (not a
 * repository): owns the IPC contract surface that the bot uses to
 * signal the scraper and read its current state.
 *
 * Ownership rules (enforced by code review, not by the DB):
 *   - Owns (writes): desiredState
 *   - Reads: the entire row via getStatus()
 *   - MUST NOT touch: actual-state or heartbeat columns (owned by
 *     ScraperControlRepository on the scraper side)
 *
 * Single-row invariant: the Plan 01 migration seeds exactly one row,
 * and this class only ever issues UPDATE/SELECT statements. UPDATE
 * without a WHERE clause is intentional — it targets the single row.
 *
 * Note on requestStart(): the scraper auto-starts on container boot
 * and does NOT poll desiredState at boot time. requestStart() writes
 * desiredState='RUNNING' so that flows that need a "please start"
 * signal (e.g. /start, /restart) can express intent through the same
 * column. The Phase 2 scraper may or may not consume this value; it
 * is never required for boot.
 */
@injectable()
export class ScraperProcess {
  public async requestStart(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "RUNNING", updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async requestStop(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "STOPPED", updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async requestKill(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "KILLED", updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  /**
   * Read the current state of the scraper. Uses the throwing variant
   * of executeTakeFirst because the table invariant guarantees exactly
   * one row at all times (seeded by the Plan 01 migration). If the
   * throw ever fires, something has corrupted the invariant.
   */
  public async getStatus(): Promise<
    Result<ScraperControlSelectable, DatabaseError>
  > {
    const result = await tryCatch(
      dbClient
        .selectFrom("scraperControl")
        .selectAll()
        .executeTakeFirstOrThrow(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }
}
