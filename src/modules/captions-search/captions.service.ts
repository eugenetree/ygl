import { Client, errors } from "@elastic/elasticsearch";
import type {
  SearchRequest,
  SearchTotalHits,
} from "@elastic/elasticsearch/lib/api/types.js";
import { injectable, unmanaged } from "inversify";
import { z } from "zod";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { tryCatch } from "../_common/try-catch.js";
import type { VideoCaption } from "./clip.js";
import { clientFromEnv } from "./search-indexes.js";

const INDEX_GONE =
  /index_not_found_exception|no_shard_available_action_exception/;

// A response error's message holds its type and the types it was caused by.
function isIndexGone(error: unknown): boolean {
  return (
    error instanceof errors.ResponseError && INDEX_GONE.test(error.message)
  );
}

// A hit is scored by multiplying the weights of the functions it matches, so
// a whole sentence of 6–14 words scores 1 and a hit with the exact phrase
// triples its score. Short captions sink harder than long ones.
const WORD_COUNT_WEIGHTS = [
  { lte: 2, weight: 0.15 },
  { gte: 3, lte: 4, weight: 0.4 },
  { gte: 5, lte: 5, weight: 0.7 },
  { gte: 15, lte: 18, weight: 0.85 },
  { gte: 19, lte: 24, weight: 0.6 },
  { gte: 25, weight: 0.35 },
];
// Applies once for a missing start and once for a missing end.
const FRAGMENT = 0.6;
// The smallest weight that lifts every phrase hit of 6–14 words above every
// hit with only the query's words, while "Make sense?" stays below a plain
// whole sentence.
const EXACT_PHRASE = 3;

const MAX_TRACKED_TOTAL = 10000;
// Elasticsearch's default max_result_window; hours of captions fit well under it.
const MAX_CAPTIONS_PER_VIDEO = 10000;

const storedCaptionSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
});

export type StoredCaption = z.infer<typeof storedCaptionSchema>;

export type CaptionSearchResult = {
  captions: StoredCaption[];
  total: number;
  isTotalExact: boolean;
};

export type SearchUnavailableError = {
  type: "SEARCH_UNAVAILABLE";
  error: unknown;
};

@injectable()
export class CaptionsService {
  constructor(
    private readonly logger: Logger,
    @unmanaged()
    private readonly esClient: Client = clientFromEnv(),
  ) {
    this.logger.setContext(CaptionsService.name);
  }

  async search(
    query: string,
    { offset, limit }: { offset: number; limit: number },
  ): Promise<Result<CaptionSearchResult, SearchUnavailableError>> {
    const searchResult = await this.searchCaptions({
      index: "captions",
      from: offset,
      size: limit,
      sort: [{ _score: { order: "desc" } }, { id: { order: "asc" } }],
      track_total_hits: MAX_TRACKED_TOTAL,
      query: {
        function_score: {
          query: {
            bool: { filter: { match: { text: { query, operator: "and" } } } },
          },
          functions: [
            ...WORD_COUNT_WEIGHTS.map(({ weight, ...range }) => ({
              filter: { range: { wordCount: range } },
              weight,
            })),
            { filter: { term: { startsSentence: false } }, weight: FRAGMENT },
            { filter: { term: { endsSentence: false } }, weight: FRAGMENT },
            { filter: { match_phrase: { text: query } }, weight: EXACT_PHRASE },
          ],
          score_mode: "multiply",
          boost_mode: "replace",
        },
      },
    });

    if (!searchResult.ok) {
      return Failure({ type: "SEARCH_UNAVAILABLE", error: searchResult.error });
    }

    const response = searchResult.value;
    const captions: StoredCaption[] = [];
    for (const hit of response.hits.hits) {
      const parsed = storedCaptionSchema.safeParse(hit._source);
      if (!parsed.success) {
        this.logger.warn(
          `Skipping stored caption ${hit._id} that failed validation: ${parsed.error.message}`,
        );
        continue;
      }
      captions.push(parsed.data);
    }
    const total = response.hits.total as SearchTotalHits;

    return Success({
      captions,
      total: total.value,
      isTotalExact: total.relation === "eq",
    });
  }

  async findByVideo(
    videoId: string,
  ): Promise<Result<VideoCaption[], SearchUnavailableError>> {
    const searchResult = await this.searchCaptions({
      index: "captions",
      size: MAX_CAPTIONS_PER_VIDEO,
      sort: [{ startTime: { order: "asc" } }, { id: { order: "asc" } }],
      query: { term: { videoId } },
    });

    if (!searchResult.ok) {
      return Failure({ type: "SEARCH_UNAVAILABLE", error: searchResult.error });
    }

    const captions: VideoCaption[] = [];
    for (const hit of searchResult.value.hits.hits) {
      const parsed = storedCaptionSchema.safeParse(hit._source);
      if (!parsed.success) {
        this.logger.warn(
          `Skipping stored caption ${hit._id} that failed validation: ${parsed.error.message}`,
        );
        continue;
      }
      const { id, startTime, endTime, text } = parsed.data;
      captions.push({ captionId: id, startTime, endTime, text });
    }

    return Success(captions);
  }

  // The first rebuild deletes the index named `captions` in the request that
  // makes `captions` an alias, failing the searches running on it. Searched
  // again, the name resolves to the new index.
  private async searchCaptions(request: SearchRequest) {
    const first = await tryCatch(this.esClient.search(request));
    if (first.ok || !isIndexGone(first.error)) return first;
    return tryCatch(this.esClient.search(request));
  }
}
