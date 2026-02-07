import { injectable } from "inversify";
import { dbClient } from "../../../../../db/client.js";
import { Failure, Success } from "../../../../../types/index.js";
import { Logger } from "../../../../_common/logger/logger.js";
import { tryCatch } from "../../../../_common/try-catch.js";
import { Caption } from "../../../../domain/caption.js";
import { Video } from "../../../../domain/video.js";

@injectable()
export class VideoRepository {
  constructor(private readonly logger: Logger) {}

  async createWithCaptions(video: Video, captions: Caption[]) {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        await trx
          .insertInto("videos")
          .values({
            ...video,
            captionType: video.captionType, // TODO: fix
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
      return Failure(result.error);
    }

    return Success(undefined);
  }
}
