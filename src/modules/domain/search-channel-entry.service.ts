import { injectable } from "inversify";
import { SearchChannelEntry } from "./search-channel-entry.js";

@injectable()
export class SearchChannelEntryService {
  create(data: { id: string; queryId: string }): SearchChannelEntry {
    return {
      id: data.id,
      queryId: data.queryId,
      processingStatus: "PENDING",
      createdAt: new Date(),
    };
  }
}
