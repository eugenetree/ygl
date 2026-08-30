import { Client } from "@elastic/elasticsearch";
import { injectable } from "inversify";
import { Logger } from "../_common/logger/logger.js";
import { Caption } from "../scraping/scrapers/video/caption.js";

@injectable()
export class CaptionsService {
  private readonly esClient: Client;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(CaptionsService.name);
    // No default: docker-compose.yml sets ES_NODE for every service that needs
    // it, so an unset value means something is misconfigured. Failing by name
    // beats falling back to an address that may not resolve.
    const esNode = process.env.ES_NODE;
    if (!esNode) {
      throw new Error("ES_NODE is not set");
    }
    this.esClient = new Client({ node: esNode });
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

  async search(query: string) {
    const response = await this.esClient.search({
      index: "captions",
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
    });

    return response.hits.hits;
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
