import { injectable } from "inversify";
import { dbClient } from "../../../db/client.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Caption } from "./captions/caption.js";
import { DatabaseError } from "../../../db/types.js";
import { Video } from "./video/video.js";

@injectable()
export class VideoRepository {
  constructor(private readonly logger: Logger) { }

  async createWithCaptions(video: Video, captions: Caption[]): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        await trx
          .insertInto("videos")
          .values(video._toPersistance())
          .execute();

        if (captions.length > 0) {
          await trx
            .insertInto("captions")
            .values(captions.map((caption) => caption._toPersistance()))
            .execute();
        }
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
