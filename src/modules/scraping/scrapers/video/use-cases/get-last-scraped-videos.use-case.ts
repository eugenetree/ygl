import { injectable } from "inversify";

import { VideoRepository } from "../video.repository.js";

@injectable()
export class GetLastScrapedVideosUseCase {
  constructor(private readonly videoRepository: VideoRepository) { }

  async execute(limit: number) {
    return this.videoRepository.getLastScraped(limit);
  }
}
