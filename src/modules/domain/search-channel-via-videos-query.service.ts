import { SearchChannelViaVideosQuery } from "./search-channel-via-videos-query.js";

export class SearchChannelViaVideosQueryService {
  create({ query }: { query: string }): SearchChannelViaVideosQuery {
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
