import { Client } from "@elastic/elasticsearch";
import { Caption } from "../scrapers/video/caption.js";
import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";

@injectable()
export class ElasticSyncService {
  private readonly esClient: Client;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(ElasticSyncService.name);
    // Use elasticsearch service name in Docker, localhost outside Docker
    const esNode = process.env.ES_NODE || "http://elasticsearch:9200";
    this.esClient = new Client({ node: esNode });
  }

  async syncDataToElastic(captions: Caption[]) {
    const isIndexExists = await this.esClient.indices.exists({ index: "captions" });

    if (!isIndexExists) {
      this.logger.info("Index does not exist, creating it");
      await this.createIndex();
    }

    await this.esClient.bulk({
      index: "captions",
      body: captions.map(caption => ({
        index: { _id: caption.id },
        document: caption,
      })),
    });
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