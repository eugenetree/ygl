import { injectable } from "inversify";

import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { ScraperConfig } from "./scraper-config.js";
import { ScraperName } from "../constants.js";

@injectable()
export class ScraperConfigRepository {
  constructor(private readonly db: DatabaseClient) {}

  public async findEnabled(): Promise<Result<ScraperConfig[], DatabaseError>> {
    const result = await tryCatch(
      this.db.selectFrom("scraperConfig")
        .selectAll()
        .where("enabled", "=", true)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }

  public async findByName(scraperName: ScraperName): Promise<Result<ScraperConfig | null, DatabaseError>> {
    const result = await tryCatch(
      this.db.selectFrom("scraperConfig")
        .selectAll()
        .where("scraperName", "=", scraperName)
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value ?? null);
  }

  public async findAll(): Promise<Result<ScraperConfig[], DatabaseError>> {
    const result = await tryCatch(
      this.db.selectFrom("scraperConfig")
        .selectAll()
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }

  public async update(config: ScraperConfig): Promise<Result<ScraperConfig, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("scraperConfig")
        .set(config)
        .where("scraperName", "=", config.scraperName)
        .returningAll()
        .executeTakeFirstOrThrow()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }
}
