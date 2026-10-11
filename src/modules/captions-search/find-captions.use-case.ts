import { injectable } from "inversify";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import {
  CaptionsService,
  type SearchUnavailableError,
} from "./captions.service.js";
import { type Clip, type ClipSearchResult, toClip } from "./clip.js";
import { ClipVideoRepository } from "./clip-video.repository.js";

@injectable()
export class FindCaptionsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly captionsService: CaptionsService,
    private readonly clipVideoRepository: ClipVideoRepository,
  ) {
    this.logger.setContext(FindCaptionsUseCase.name);
  }

  async execute(
    query: string,
    page: { offset: number; limit: number },
  ): Promise<Result<ClipSearchResult, SearchUnavailableError>> {
    const found = await this.captionsService.search(query, page);
    if (!found.ok) {
      return found;
    }

    const { captions, total, isTotalExact } = found.value;
    const videos = await this.clipVideoRepository.findByIds([
      ...new Set(captions.map((caption) => caption.videoId)),
    ]);
    if (!videos.ok) {
      return Failure({ type: "SEARCH_UNAVAILABLE", error: videos.error.error });
    }

    const clips: Clip[] = [];
    for (const caption of captions) {
      const video = videos.value.get(caption.videoId);
      if (!video) {
        this.logger.warn(
          `Skipping caption ${caption.id}: its video ${caption.videoId} is not in the database`,
        );
        continue;
      }
      clips.push(toClip(caption, video));
    }

    this.logger.info(
      `Found ${total}${isTotalExact ? "" : "+"} clips for query: ${query}`,
    );
    return Success({ clips, total, isTotalExact });
  }
}
