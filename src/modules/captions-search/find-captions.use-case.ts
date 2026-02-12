import { Client } from "@elastic/elasticsearch";
import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";
import { ElasticSyncService } from "./elastic-captions-sync.service.js";

@injectable()
export class FindCaptionsUseCase {
  private readonly esClient: Client;

  constructor(private readonly logger: Logger, private readonly elasticSyncService: ElasticSyncService) {
    this.logger.setContext(FindCaptionsUseCase.name);
    // Use elasticsearch service name in Docker, localhost outside Docker
    const esNode = process.env.ES_NODE || "http://elasticsearch:9200";
    this.esClient = new Client({ node: esNode });
  }

  async execute(query: string) {
    const response = await this.esClient.search({
      index: "captions",
      query: {
        bool: {
          must: {
            match: {
              "document.text": {
                query: query,
                operator: "and",
              },
            },
          },
          should: {
            match_phrase: {
              "document.text": query,
            },
          },
        },
      },
    });

    this.logger.info(`Found ${response.hits.total} captions for query: ${query}`);
    console.log(JSON.stringify(response.hits.hits, null, 2));
    return response.hits.hits;
  }
}