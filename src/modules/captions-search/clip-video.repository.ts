import { injectable } from "inversify";
import { DatabaseClient } from "../../db/client.js";
import type { DatabaseError } from "../../db/types.js";
import { Failure, type Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";
import type { ClipVideo } from "./clip.js";

@injectable()
export class ClipVideoRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findByIds(
    videoIds: string[],
  ): Promise<Result<Map<string, ClipVideo>, DatabaseError>> {
    if (videoIds.length === 0) {
      return Success(new Map());
    }

    const result = await tryCatch(
      this.db
        .selectFrom("videos")
        .innerJoin("channels", "channels.id", "videos.channelId")
        .where("videos.id", "in", videoIds)
        .select(["videos.id", "videos.title", "channels.name as channelName"])
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(
      new Map(
        result.value.map((row) => [
          row.id,
          { id: row.id, title: row.title, channel: { name: row.channelName } },
        ]),
      ),
    );
  }
}
