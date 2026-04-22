import { Client } from "@elastic/elasticsearch";
import { Caption } from "../scraping/scrapers/video/caption.js";
import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";

@injectable()
export class CaptionsService {
  private readonly esClient: Client;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(CaptionsService.name);
    // Use elasticsearch service name in Docker, localhost outside Docker
    const esNode = process.env.ES_NODE || "http://elasticsearch:9200";
    this.esClient = new Client({ node: esNode });
  }

  async sync(captions: Caption[]) {
    const isIndexExists = await this.esClient.indices.exists({ index: "captions" });

    if (!isIndexExists) {
      this.logger.info("Index does not exist, creating it");
      await this.createIndex();
    }

    await this.esClient.bulk({
      index: "captions",
      operations: captions.flatMap(caption => [
        { index: { _id: caption.id } },
        caption,
      ]),
    });
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
              type: "standard"
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
    })
  }
}
