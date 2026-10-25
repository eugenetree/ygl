import { setTimeout as sleep } from "node:timers/promises";
import { injectable, unmanaged } from "inversify";
import type { DatabaseError } from "../../db/types.js";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { tryCatch } from "../_common/try-catch.js";
import type { SearchUnavailableError } from "./captions.service.js";
import {
  type CaptionToIndex,
  ElasticCaptionsSyncRepository,
} from "./elastic-captions-sync.repository.js";
import { SEARCH_INDEX, SearchIndexes } from "./search-indexes.js";

export type RebuildSearchIndexResult = {
  indexed: number;
  /** Documents in the index searches ran against before, or null if none. */
  oldIndexSize: number | null;
  newIndexSize: number;
};

export type RebuildStoppedError = { type: "REBUILD_STOPPED"; error: unknown };

export type RebuildSearchIndexError =
  | DatabaseError
  | SearchUnavailableError
  | RebuildStoppedError;

export type RebuildSearchIndexOptions = {
  /** How long searches already running on the old index get to finish. */
  oldIndexGraceMs: number;
};

const VIDEOS_PAGE_SIZE = 1000;
// About 1,000 × 350 bytes ≈ 0.35 MB per request, far under the 10% of a
// 512 MB heap Elasticsearch lets in-flight writes take, so searches keep room.
const BULK_BATCH_SIZE = 1000;

@injectable()
export class RebuildSearchIndexUseCase {
  constructor(
    private readonly elasticCaptionsSyncRepository: ElasticCaptionsSyncRepository,
    private readonly searchIndexes: SearchIndexes,
    private readonly logger: Logger,
    @unmanaged()
    private readonly options: RebuildSearchIndexOptions = {
      oldIndexGraceMs: 5_000,
    },
  ) {
    this.logger.setContext(RebuildSearchIndexUseCase.name);
  }

  /** A failure leaves the index searches run against as it was. */
  async execute(
    signal: AbortSignal = new AbortController().signal,
  ): Promise<Result<RebuildSearchIndexResult, RebuildSearchIndexError>> {
    const startedAt = new Date();
    const state = await search(this.searchIndexes.state());
    if (!state.ok) return state;
    const { live, others } = state.value;
    for (const leftover of others) {
      const deleted = await search(this.searchIndexes.delete(leftover));
      if (!deleted.ok) return deleted;
    }
    const watermark =
      await this.elasticCaptionsSyncRepository.newestCaptionId();
    if (!watermark.ok) return watermark;
    const syncId = await this.elasticCaptionsSyncRepository.create({
      syncStatus: "IN_PROGRESS",
      syncStartedAt: startedAt,
    });
    if (!syncId.ok) return syncId;

    const index = await search(this.searchIndexes.createDated(startedAt));
    if (!index.ok) return index;
    this.logger.info(`Rebuilding the search index into ${index.value}`);

    const indexed = await this.indexSearchableCaptions(index.value, signal);
    if (!indexed.ok) return indexed;

    const sizes = await search(
      (async () => {
        await this.searchIndexes.refresh(index.value);
        return {
          newIndexSize: await this.searchIndexes.count(index.value),
          oldIndexSize: live ? await this.searchIndexes.count(live) : null,
        };
      })(),
    );
    if (!sizes.ok) return sizes;

    if (signal.aborted) return stopped(signal);
    // Recorded before the swap, so the swap is the last step that can fail the
    // run.
    const recorded = await this.elasticCaptionsSyncRepository.update(
      syncId.value,
      {
        syncStatus: "SUCCESS",
        syncCompletedAt: new Date(),
        latestSyncedCaptionId: watermark.value,
      },
    );
    if (!recorded.ok) return recorded;
    const madeLive = await search(
      this.searchIndexes.makeLive(index.value, live),
    );
    if (!madeLive.ok) {
      // The old index may lack captions up to this watermark, so the
      // incremental sync goes on from the sync before this one.
      await this.elasticCaptionsSyncRepository.update(syncId.value, {
        syncStatus: "FAIL",
      });
      return madeLive;
    }
    this.logger.info(`Searches now run against ${index.value}`);

    // The first time, the old index went with the request that made the new
    // one live.
    if (live && live !== SEARCH_INDEX) {
      await sleep(this.options.oldIndexGraceMs);
      await this.deleteOldIndex(live);
    }

    return Success({ indexed: indexed.value, ...sizes.value });
  }

  /** Writes every searchable video's manual captions to `index`, returning how many. */
  private async indexSearchableCaptions(
    index: string,
    signal: AbortSignal,
  ): Promise<Result<number, RebuildSearchIndexError>> {
    let indexed = 0;
    let batch: CaptionToIndex[] = [];
    const flush = async () => {
      const written = await search(this.searchIndexes.write(index, batch));
      if (written.ok) {
        indexed += batch.length;
        batch = [];
      }
      return written;
    };

    let afterId: string | null = null;
    while (true) {
      const videoIds: Result<string[], DatabaseError> =
        await this.elasticCaptionsSyncRepository.searchableVideoIds(
          afterId,
          VIDEOS_PAGE_SIZE,
        );
      if (!videoIds.ok) return videoIds;
      if (videoIds.value.length === 0) break;

      for (const videoId of videoIds.value) {
        if (signal.aborted) return stopped(signal);
        const captions =
          await this.elasticCaptionsSyncRepository.manualCaptionsOfVideo(
            videoId,
          );
        if (!captions.ok) return captions;
        batch.push(...captions.value);
        if (batch.length >= BULK_BATCH_SIZE) {
          const written = await flush();
          if (!written.ok) return written;
        }
      }
      afterId = videoIds.value[videoIds.value.length - 1];
      this.logger.info(`Indexed ${indexed} captions, up to video ${afterId}`);
    }
    if (batch.length > 0) {
      const written = await flush();
      if (!written.ok) return written;
    }
    return Success(indexed);
  }

  // The new index is live by now, so a failure here doesn't fail the run: the
  // next rebuild deletes the old index with the other leftovers.
  private async deleteOldIndex(index: string): Promise<void> {
    const deleted = await search(this.searchIndexes.delete(index));
    if (!deleted.ok) {
      this.logger.error({
        message: `Failed to delete the old search index ${index}`,
        error: deleted.error.error,
      });
    }
  }
}

async function search<T>(
  promise: Promise<T>,
): Promise<Result<T, SearchUnavailableError>> {
  const result = await tryCatch(promise);
  if (!result.ok) {
    return Failure({ type: "SEARCH_UNAVAILABLE", error: result.error });
  }
  return result;
}

function stopped(signal: AbortSignal): Result<never, RebuildStoppedError> {
  return Failure({ type: "REBUILD_STOPPED", error: signal.reason });
}
