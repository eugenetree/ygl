import { Client } from "@elastic/elasticsearch";
import type {
  IndicesIndexSettings,
  MappingTypeMapping,
} from "@elastic/elasticsearch/lib/api/types.js";
import { injectable, unmanaged } from "inversify";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { tryCatch } from "../_common/try-catch.js";
import type { SearchUnavailableError } from "./captions.service.js";

/** What searches and the incremental sync address the search index by. */
export const SEARCH_INDEX = "captions";

const DATED_INDEX_PREFIX = `${SEARCH_INDEX}-`;

// The mappings name fields in snake_case while documents are camelCase, so most
// fields are mapped dynamically, and searches rely on that (`videoId.keyword`).
export const SEARCH_INDEX_SETTINGS: IndicesIndexSettings = {
  analysis: {
    analyzer: {
      caption_analyzer: {
        type: "standard",
      },
    },
  },
  number_of_shards: 1,
  number_of_replicas: 0,
};

export const SEARCH_INDEX_MAPPINGS: MappingTypeMapping = {
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
};

export type SearchIndexDocument = { id: string } & Record<string, unknown>;

export type SearchIndexesState = {
  /** The index searches run against, or null if there is none yet. */
  live: string | null;
  /** Dated indices searches don't run against, oldest first. */
  others: string[];
};

export type RebuildProgress = {
  /** Documents in the index being built. */
  indexed: number;
  /** Documents in the index searches run against, or null if none. */
  liveSize: number | null;
};

export function clientFromEnv(): Client {
  // Use elasticsearch service name in Docker, localhost outside Docker
  const esNode = process.env.ES_NODE || "http://elasticsearch:9200";
  return new Client({ node: esNode });
}

/** The indices behind the search index, and switching which one is live. */
@injectable()
export class SearchIndexes {
  constructor(
    private readonly logger: Logger,
    @unmanaged()
    private readonly esClient: Client = clientFromEnv(),
  ) {
    this.logger.setContext(SearchIndexes.name);
  }

  async state(): Promise<SearchIndexesState> {
    const indices = await this.esClient.indices.getAlias({
      index: `${SEARCH_INDEX}*`,
    });
    let live: string | null = null;
    const others: string[] = [];
    for (const [name, { aliases }] of Object.entries(indices)) {
      if (name === SEARCH_INDEX || (aliases && SEARCH_INDEX in aliases)) {
        live = name;
      } else if (name.startsWith(DATED_INDEX_PREFIX)) {
        others.push(name);
      }
    }
    return { live, others: others.sort() };
  }

  /** Creates an empty index named after `now`, with the search index's mappings. */
  async createDated(now: Date): Promise<string> {
    const stamp = now.toISOString().replace(/[-:.]/g, "").toLowerCase();
    const index = `${DATED_INDEX_PREFIX}${stamp}`;
    await this.esClient.indices.create({
      index,
      settings: SEARCH_INDEX_SETTINGS,
      mappings: SEARCH_INDEX_MAPPINGS,
    });
    return index;
  }

  async delete(index: string): Promise<void> {
    this.logger.info(`Deleting index ${index}`);
    await this.esClient.indices.delete({ index });
  }

  /** Writes documents keyed by id, failing if Elasticsearch rejects any. */
  async write(index: string, documents: SearchIndexDocument[]): Promise<void> {
    const response = await this.esClient.bulk({
      index,
      operations: documents.flatMap((document) => [
        { index: { _id: document.id } },
        document,
      ]),
    });
    if (response.errors) {
      const failed = response.items.find((item) => item.index?.error);
      throw new Error(
        `Elasticsearch rejected documents written to ${index}: ${JSON.stringify(failed?.index?.error)}`,
      );
    }
  }

  /** Makes every document written so far count and be searchable. */
  async refresh(index: string): Promise<void> {
    await this.esClient.indices.refresh({ index });
  }

  async count(index: string): Promise<number> {
    const { count } = await this.esClient.count({ index });
    return count;
  }

  /** How far a rebuild has got, or null when no index is being built. */
  async rebuildProgress(): Promise<
    Result<RebuildProgress | null, SearchUnavailableError>
  > {
    const result = await tryCatch(
      (async () => {
        const { live, others } = await this.state();
        // Names sort by when the index was created, and a rebuild's index is
        // the newest. One older than the live index awaits deletion.
        const building = others.at(-1);
        if (!building || (live !== null && building < live)) return null;
        return {
          indexed: await this.count(building),
          liveSize: live ? await this.count(live) : null,
        };
      })(),
    );
    if (!result.ok) {
      return Failure({ type: "SEARCH_UNAVAILABLE", error: result.error });
    }
    return Success(result.value);
  }

  /**
   * Points the search index at `index` in one atomic request. The first time,
   * the live index is the one literally named like the alias, so it has to be
   * deleted in that same request. Otherwise it is left for the caller to
   * delete: deleting it in the request fails the searches running on it.
   */
  async makeLive(index: string, live: string | null): Promise<void> {
    await this.esClient.indices.updateAliases({
      actions: [
        { add: { index, alias: SEARCH_INDEX } },
        ...(live === SEARCH_INDEX
          ? [{ remove_index: { index: live } }]
          : live
            ? [{ remove: { index: live, alias: SEARCH_INDEX } }]
            : []),
      ],
    });
  }
}
