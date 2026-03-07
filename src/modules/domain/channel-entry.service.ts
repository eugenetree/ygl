import { injectable } from "inversify";
import { ChannelEntry } from "./channel-entry.js";

@injectable()
export class ChannelEntryService {
  create(data: { id: string; queryId: string }): ChannelEntry {
    return {
      id: data.id,
      queryId: data.queryId,
      processingStatus: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
