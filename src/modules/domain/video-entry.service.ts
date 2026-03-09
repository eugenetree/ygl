import { injectable } from "inversify";
import { VideoEntry } from "./video-entry.js";

@injectable()
export class VideoEntryService {
  create(
    videoEntry: Omit<VideoEntry, "createdAt" | "updatedAt">,
  ): VideoEntry {
    return {
      createdAt: new Date(),
      updatedAt: new Date(),
      ...videoEntry,
    };
  }
}
