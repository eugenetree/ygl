import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { DatabaseClient } from "../../../../db/client.js";

@injectable()
export class TranscriptionJobsQueue {
  constructor(private readonly db: DatabaseClient) {}

  public async enqueue(videoId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
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
