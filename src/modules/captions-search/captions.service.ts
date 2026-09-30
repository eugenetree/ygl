import { Client } from "@elastic/elasticsearch";
import type { SearchTotalHits } from "@elastic/elasticsearch/lib/api/types.js";
import { injectable, unmanaged } from "inversify";
import { z } from "zod";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { tryCatch } from "../_common/try-catch.js";
import { Caption } from "../scraping/scrapers/video/caption.js";
import { type Clip, type ClipSearchResult, toClip } from "./clip.js";

const MAX_TRACKED_TOTAL = 10000;

const storedCaptionSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
});

export type SearchUnavailableError = {
  type: "SEARCH_UNAVAILABLE";
  error: unknown;
};

function clientFromEnv(): Client {
  // Use elasticsearch service name in Docker, localhost outside Docker
  const esNode = process.env.ES_NODE || "http://elasticsearch:9200";
  return new Client({ node: esNode });
}

@injectable()
export class CaptionsService {
  constructor(
    private readonly logger: Logger,
    @unmanaged()
    private readonly esClient: Client = clientFromEnv(),
  ) {
    this.logger.setContext(CaptionsService.name);
  }

  async sync(captions: Caption[], batchSize = 2000) {
    const isIndexExists = await this.esClient.indices.exists({
      index: "captions",
    });

    if (!isIndexExists) {
      this.logger.info("Index does not exist, creating it");
      await this.createIndex();
    }

    for (let i = 0; i < captions.length; i += batchSize) {
      const batch = captions.slice(i, i + batchSize);
      await this.esClient.bulk({
        index: "captions",
        operations: batch.flatMap((caption) => [
          { index: { _id: caption.id } },
          caption,
        ]),
      });
    }
  }

  async search(
    query: string,
    { offset, limit }: { offset: number; limit: number },
  ): Promise<Result<ClipSearchResult, SearchUnavailableError>> {
    const searchResult = await tryCatch(
      this.esClient.search({
        index: "captions",
        from: offset,
        size: limit,
        sort: [{ _score: { order: "desc" } }, { id: { order: "asc" } }],
        track_total_hits: MAX_TRACKED_TOTAL,
        query: {
          bool: {
            must: {
              match: {
                text: {
                  query,
                  operator: "and",
                },
              },
            },
            should: {
              match_phrase: {
                text: query,
              },
            },
          },
        },
      }),
    );

    if (!searchResult.ok) {
      return Failure({ type: "SEARCH_UNAVAILABLE", error: searchResult.error });
    }

    const response = searchResult.value;
    const clips: Clip[] = [];
    for (const hit of response.hits.hits) {
      const parsed = storedCaptionSchema.safeParse(hit._source);
      if (!parsed.success) {
        this.logger.warn(
          `Skipping stored caption ${hit._id} that failed validation: ${parsed.error.message}`,
        );
        continue;
      }
      clips.push(toClip(parsed.data));
    }
    const total = response.hits.total as SearchTotalHits;

    return Success({
      clips,
      total: total.value,
      isTotalExact: total.relation === "eq",
    });
  }

  async clear() {
    const exists = await this.esClient.indices.exists({ index: "captions" });
    if (exists) {
      this.logger.info("Deleting captions index");
      await this.esClient.indices.delete({ index: "captions" });
    }
  }

  private async createIndex() {
    await this.esClient.indices.create({
      index: "captions",
      settings: {
        analysis: {
          analyzer: {
            caption_analyzer: {
              type: "standard",
            },
          },
        },
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          id: { type: "keyword" },
          video_id: { type: "keyword" },
          type: { type: "keyword" },
          start_time: { type: "long" },
          end_time: { type: "long" },
          duration: { type: "long" },
          text: {
            type: "text",
            analyzer: "caption_analyzer",
            fields: {
              keyword: { type: "keyword" },
            },
          },
          channel_id: { type: "keyword" },
          channel_name: { type: "text" },
        },
      },
    });
  }
}
