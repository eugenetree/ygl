import { readFile } from "fs/promises";
import { injectable } from "inversify";
import path from "path";
import { DatabaseClient } from "../../../../db/client.js";
import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";

function resolveWordsFilePath(appEnv: string | undefined): string {
  const dataDir = path.join(__dirname, "data");
  return path.join(
    dataDir,
    appEnv === "development" ? "dev.json" : "prod.json",
  );
}

@injectable()
export class SearchChannelQueriesSeeder {
  constructor(
    private readonly logger: Logger,
    private readonly db: DatabaseClient,
  ) {
    this.logger.setContext(SearchChannelQueriesSeeder.name);
  }

  async seedIfNeeded() {
    const anyQueryResult = await tryCatch(
      this.db.selectFrom("searchChannelQueries").selectAll().executeTakeFirst(),
    );

    if (!anyQueryResult.ok) {
      return Failure({
        type: "SEEDING_ERROR",
        cause: anyQueryResult.error,
      });
    }

    const anyQuery = anyQueryResult.value;
    if (anyQuery) {
      this.logger.info("'searchChannelQueries' table already seeded");
      return Success(undefined);
    }

    this.logger.info("Seeding 'searchChannelQueries' table");
    const seedResult = await this.seedQueriesIntoStorage();

    if (!seedResult.ok) {
      this.logger.error({ error: seedResult.error });
      return Failure(seedResult.error);
    }

    this.logger.info("'searchChannelQueries' table seeded");
    return Success(undefined);
  }

  private async seedQueriesIntoStorage() {
    const wordsFilePath = resolveWordsFilePath(process.env.APP_ENV);
    const wordsJsonResult = await tryCatch(readFile(wordsFilePath, "utf-8"));

    if (!wordsJsonResult.ok) {
      return Failure(
        new Error("Failed to read words file", {
          cause: wordsJsonResult.error,
        }),
      );
    }

    const wordsJson = wordsJsonResult.value;
    const wordsResult = await tryCatch(JSON.parse(wordsJson));

    if (!wordsResult.ok) {
      return Failure(
        new Error("Failed to parse words file", {
          cause: wordsResult.error,
        }),
      );
    }

    const words = Object.keys(wordsResult.value!) as string[];
    const chunkSize = 100;

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      const queryIds = chunk.map(() => crypto.randomUUID());

      this.logger.info(
        `Seeding ${chunk.length} queries into storage ${i * chunkSize}/${words.length}`,
      );

      const dbResult = await tryCatch(
        this.db
          .insertInto("searchChannelQueries")
          .values(
            chunk.map((word: string, index: number) => ({
              id: queryIds[index],
              query: word,
            })),
          )
          .execute(),
      );

      if (!dbResult.ok) {
        return Failure(
          new Error("Failed to insert words into database", {
            cause: dbResult.error,
          }),
        );
      }

      const jobResult = await tryCatch(
        this.db
          .insertInto("channelDiscoveryJobs")
          .values(
            queryIds.map((id) => ({
              searchQueryId: id,
              status: "PENDING" as const,
              statusUpdatedAt: new Date(),
            })),
          )
          .execute(),
      );

      if (!jobResult.ok) {
        return Failure(
          new Error("Failed to insert channel discovery jobs", {
            cause: jobResult.error,
          }),
        );
      }
    }

    return Success(undefined);
  }
}
