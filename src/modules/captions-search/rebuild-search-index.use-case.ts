import { setTimeout as sleep } from "node:timers/promises";
import { injectable, unmanaged } from "inversify";
import type { Result } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
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

  /** Throws on failure, leaving the index searches run against as it was. */
  async execute(
    signal: AbortSignal = new AbortController().signal,
  ): Promise<RebuildSearchIndexResult> {
    const startedAt = new Date();
    const { live, others } = await this.searchIndexes.state();
    for (const leftover of others) {
      await this.searchIndexes.delete(leftover);
    }
    const watermark = unwrap(
      await this.elasticCaptionsSyncRepository.newestCaptionId(),
    );
    const syncId = unwrap(
      await this.elasticCaptionsSyncRepository.create({
        syncStatus: "IN_PROGRESS",
        syncStartedAt: startedAt,
      }),
    );

    const index = await this.searchIndexes.createDated(startedAt);
    this.logger.info(`Rebuilding the search index into ${index}`);

    let indexed = 0;
    let batch: CaptionToIndex[] = [];
    const flush = async () => {
      await this.searchIndexes.write(index, batch);
      indexed += batch.length;
      batch = [];
    };

    let afterId: string | null = null;
    while (true) {
      const videoIds: string[] = unwrap(
        await this.elasticCaptionsSyncRepository.searchableVideoIds(
          afterId,
          VIDEOS_PAGE_SIZE,
        ),
      );
      if (videoIds.length === 0) break;

      for (const videoId of videoIds) {
        signal.throwIfAborted();
        const captions = unwrap(
          await this.elasticCaptionsSyncRepository.manualCaptionsOfVideo(
            videoId,
          ),
        );
        batch.push(...captions);
        if (batch.length >= BULK_BATCH_SIZE) await flush();
      }
      afterId = videoIds[videoIds.length - 1];
      this.logger.info(`Indexed ${indexed} captions, up to video ${afterId}`);
    }
    if (batch.length > 0) await flush();

    await this.searchIndexes.refresh(index);
    const newIndexSize = await this.searchIndexes.count(index);
    const oldIndexSize = live ? await this.searchIndexes.count(live) : null;

    signal.throwIfAborted();
    await this.searchIndexes.makeLive(index, live);
    this.logger.info(`Searches now run against ${index}`);

    unwrap(
      await this.elasticCaptionsSyncRepository.update(syncId, {
        syncStatus: "SUCCESS",
        syncCompletedAt: new Date(),
        latestSyncedCaptionId: watermark,
      }),
    );

    // The first time, the old index went with the request that made the new
    // one live.
    if (live && live !== SEARCH_INDEX) {
      await sleep(this.options.oldIndexGraceMs);
      await this.searchIndexes.delete(live);
    }

    return { indexed, oldIndexSize, newIndexSize };
  }
}

function unwrap<T>(result: Result<T, { type: string; error?: unknown }>): T {
  if (!result.ok) {
    throw result.error.error ?? new Error(result.error.type);
  }
  return result.value;
}
