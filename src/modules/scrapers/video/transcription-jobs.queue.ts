import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";

@injectable()
export class TranscriptionJobsQueue {
  constructor(private readonly logger: Logger) { }

  public async enqueue(videoId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .insertInto("transcriptionJobs")
        .values({ videoId, status: "PENDING", statusUpdatedAt: new Date() })
        .onConflict((oc) => oc.column("videoId").doNothing())
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
