import { injectable } from "inversify";
import { ChannelPriorityService } from "./channel-priority.service.js";

@injectable()
export class GetTopChannelsByPriorityUseCase {
  constructor(
    private readonly channelPriorityService: ChannelPriorityService,
  ) {}

  async execute({ activeOnly }: { activeOnly: boolean }) {
    return this.channelPriorityService.getTopChannels({ activeOnly });
  }
}
