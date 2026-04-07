import { injectable } from "inversify";

import { dbClient } from "../../db/client.js";
import { ActualScraperState, DatabaseError } from "../../db/types.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";

/**
 * Scraper-side writer for the single-row `scraper_control` table.
 *
 * Ownership rules (enforced by code review, not by the DB):
 *   - Owns: actualState, heartbeatAt
 *   - MUST NOT touch: the desired-state column (owned by ScraperProcess on the bot side)
 *
 * Single-row invariant: the migration seeds exactly one row, and this
 * repository only ever issues UPDATE statements (no INSERT). Therefore
 * UPDATE without a WHERE clause is intentional and correct — it targets
 * the single row.
 */
@injectable()
export class ScraperControlRepository {
  public async setActualState(
    state: ActualScraperState,
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ actualState: state, updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async updateHeartbeat(): Promise<Result<void, DatabaseError>> {
    const now = new Date();
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ heartbeatAt: now, updatedAt: now })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
