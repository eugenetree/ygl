import { SearchChannelDirectQuery } from "./search-channel-direct-query.js";

export class SearchChannelDirectQueryService {
  create({ query }: { query: string }): SearchChannelDirectQuery {
    return {
      id: crypto.randomUUID(),
      query,
      processingStatus: "NOT_STARTED",
      processingStatusUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
