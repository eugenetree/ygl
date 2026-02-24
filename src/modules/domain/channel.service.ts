import { injectable } from "inversify";
import { Channel } from "./channel.js";

@injectable()
export class ChannelService {
  create(
    channel: Omit<
      Channel,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "videosDiscoveryStatus"
      | "videosDiscoveryStatusUpdatedAt"
    >,
  ): Channel {
    return {
      id: crypto.randomUUID(),
      videosDiscoveryStatus: "NOT_STARTED",
      videosDiscoveryStatusUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...channel,
    };
  }
}