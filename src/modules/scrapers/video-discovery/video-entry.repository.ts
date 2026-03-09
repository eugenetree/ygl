import { injectable } from "inversify";
import { dbClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";
import { VideoEntry } from "../../domain/video-entry.js";

@injectable()
export class VideoEntryRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(VideoEntryRepository.name);
  }

  async findById(id: string): Promise<Result<VideoEntry | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("videoEntries")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
        context: { id },
      });
    }

    return Success((result.value) ?? null);
  }

  async create(
    videoEntry: VideoEntry,
  ): Promise<Result<void, DatabaseError>> {
    const insertResult = await tryCatch(
      dbClient.insertInto("videoEntries").values({ ...videoEntry, processingStatus: "PENDING" as const }).execute()
    );

    if (!insertResult.ok) {
      this.logger.error({
        message: "Failed to create video entry",
        error: insertResult.error,
        context: { videoId: videoEntry.id },
      });

      return Failure({
        type: "DATABASE",
        error: insertResult.error,
      });
    }

    return Success(undefined);
  }
}
