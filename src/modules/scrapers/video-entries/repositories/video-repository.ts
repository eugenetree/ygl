import { injectable } from "inversify";
import { dbClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Caption } from "../../../domain/caption.js";
import { Video } from "../../../domain/video.js";
import { DatabaseError } from "../../../../db/types.js";

@injectable()
export class VideoRepository {
  constructor(private readonly logger: Logger) { }

  async createWithCaptions(video: Video, captions: Caption[]): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        await trx
          .insertInto("videos")
          .values({
            ...video,
          })
          .execute();

        await trx
          .insertInto("captions")
          .values(
            captions.map((caption) => ({
              ...caption,
              videoId: video.id,
            })),
          )
          .execute();
      }),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(undefined);
  }
}
