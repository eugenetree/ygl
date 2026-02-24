import { injectable } from "inversify";
import { VideoEntry } from "./video-entry.js";

@injectable()
export class VideoEntryService {
  create(
    videoEntry: Omit<VideoEntry, "createdAt" | "updatedAt" | "processingStatus">,
  ): VideoEntry {
    return {
      processingStatus: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...videoEntry,
    };
  }
}
