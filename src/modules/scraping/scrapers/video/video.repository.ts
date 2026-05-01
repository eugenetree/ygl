import { injectable } from "inversify";
import { DatabaseClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Caption, CaptionProps } from "./caption.js";
import { Video, VideoProps } from "./video.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "./config.js";
import { DatabaseError } from "../../../../db/types.js";

export type VideoWithCaptions = {
  video: Video;
  autoCaptions: Caption[];
  manualCaptions: Caption[];
};

// 7 bound params per caption row (id, startTime, endTime, duration, text, type, videoId)
const CAPTIONS_CHUNK_SIZE = Math.floor(65535 / 7);

@injectable()
export class VideoRepository {
  constructor(
    private readonly logger: Logger,
    private readonly db: DatabaseClient,
  ) {}

  async createWithCaptions({
    video,
    autoCaptions,
    manualCaptions,
  }: {
    video: VideoProps,
    autoCaptions: CaptionProps[],
    manualCaptions: CaptionProps[],
  }): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto("videos")
          .values(video)
          .execute();

        for (const caption of [autoCaptions, manualCaptions]) {
          for (let i = 0; i < caption.length; i += CAPTIONS_CHUNK_SIZE) {
            await trx
              .insertInto("captions")
              .values(
                caption.slice(i, i + CAPTIONS_CHUNK_SIZE).map((c) => ({
                  ...c,
                  id: crypto.randomUUID(),
                  videoId: video.id,
                })),
              )
              .execute();
          }
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

  async *getVideosForReprocessing(): AsyncGenerator<Result<VideoWithCaptions, DatabaseError>> {
    let lastVideoId: string | null = null;

    while (true) {
      let query = this.db
        .selectFrom("videos")
        .selectAll()
        .where("autoCaptionsStatus", "!=", "CAPTIONS_ABSENT")
        .where("manualCaptionsStatus", "!=", "CAPTIONS_ABSENT")
        .where((eb) =>
          eb.or([
            eb("captionsProcessingAlgorithmVersion", "is", null),
            eb("captionsProcessingAlgorithmVersion", "!=", CAPTIONS_PROCESSING_ALGORITHM_VERSION),
          ]),
        );

      if (lastVideoId) {
        query = query.where("id", ">", lastVideoId);
      }

      const videoResult = await tryCatch(
        query.orderBy("id", "asc").limit(1).executeTakeFirst(),
      );

      if (!videoResult.ok) {
        yield Failure({ type: "DATABASE", error: videoResult.error });
        return;
      }

      const video = videoResult.value;
      if (!video) return;

      lastVideoId = video.id;

      const captionsResult = await tryCatch(
        this.db
          .selectFrom("captions")
          .selectAll()
          .where("videoId", "=", video.id)
          .orderBy("startTime", "asc")
          .execute(),
      );

      if (!captionsResult.ok) {
        yield Failure({ type: "DATABASE", error: captionsResult.error });
        return;
      }

      const captions = captionsResult.value;

      yield Success({
        video,
        autoCaptions: captions.filter((c) => c.type === "auto"),
        manualCaptions: captions.filter((c) => c.type === "manual"),
      });
    }
  }

  async getLastScraped(
    limit: number,
  ): Promise<Result<Array<Pick<Video, "id" | "languageCode" | "languageCodeYtdlp" | "createdAt">>, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("videos")
        .select(["id", "languageCode", "languageCodeYtdlp", "createdAt"])
        .orderBy("createdAt", "desc")
        .limit(limit)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }

  async update(videoId: string, data: Partial<VideoProps>): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("videos")
        .set(data)
        .where("id", "=", videoId)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
