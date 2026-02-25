import { readFile } from "fs/promises";
import path from "path";

import { dbClient } from "../../../db/index.js";
import { Failure, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { injectable } from "inversify";

@injectable()
export class SearchChannelViaVideosQueriesSeeder {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(SearchChannelViaVideosQueriesSeeder.name);
  }

  async seedIfNeeded() {
    const anyQueryResult = await tryCatch(
      dbClient
        .selectFrom("searchChannelViaVideosQueries")
        .selectAll()
        .executeTakeFirst(),
    );

    if (!anyQueryResult.ok) {
      return Failure(
        new Error("Failed to get any query", { cause: anyQueryResult.error }),
      );
    }

    const anyQuery = anyQueryResult.value;
    if (anyQuery) {
      this.logger.info("'searchChannelViaVideosQueries' table already seeded");
      return Success(undefined);
    }

    this.logger.info("Seeding 'searchChannelViaVideosQueries' table");
    const seedResult = await this.seedQueriesIntoStorage();

    if (!seedResult.ok) {
      this.logger.error({ error: seedResult.error });
      return Failure(seedResult.error);
    }

    this.logger.info("'searchChannelViaVideosQueries' table seeded");
    return Success(undefined);
  }

  private async seedQueriesIntoStorage() {
    const wordsFilePath = path.join(process.cwd(), "words_dictionary.json");
    const wordsJsonResult = await tryCatch(
      readFile(wordsFilePath, "utf-8"),
    );

    if (!wordsJsonResult.ok) {
      return Failure(
        new Error("Failed to read words_dictionary.json", {
          cause: wordsJsonResult.error,
        }),
      );
    }

    const wordsJson = wordsJsonResult.value;
    const wordsResult = await tryCatch(JSON.parse(wordsJson));

    if (!wordsResult.ok) {
      return Failure(
        new Error("Failed to parse words_dictionary.json", { cause: wordsResult.error }),
      );
    }

    const words = Object.keys(wordsResult.value!) as string[];
    const chunkSize = 100;

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);

      const dbResult = await tryCatch(
        dbClient
          .insertInto("searchChannelViaVideosQueries")
          .values(
            chunk.map((word: string) => ({
              id: crypto.randomUUID(),
              query: word,
              processingStatus: "PENDING" as const,
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
    }

    return Success(undefined);
  }
}
