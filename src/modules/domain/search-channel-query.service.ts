import { SearchChannelQuery } from "./search-channel-query.js";

export class SearchChannelQueryService {
  create({ query }: { query: string }): SearchChannelQuery {
    return {
      id: crypto.randomUUID(),
      query,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
