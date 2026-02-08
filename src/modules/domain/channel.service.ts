import { injectable } from "inversify";
import { Channel } from "./channel.js";

@injectable()
export class ChannelService {
  create(channel: Omit<Channel, "id" | "createdAt" | "updatedAt">): Channel {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...channel,
    };
  }
}