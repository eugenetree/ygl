import { injectable } from "inversify";
import { CaptionsService } from "./captions.service.js";

@injectable()
export class FindVideoCaptionsUseCase {
  constructor(private readonly captionsService: CaptionsService) {}

  async execute(videoId: string) {
    return this.captionsService.findByVideo(videoId);
  }
}
