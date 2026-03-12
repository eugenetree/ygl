import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { VideoEntryRow } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { YoutubeApiGetVideo } from "../../../youtube-api/yt-api-get-video.js";
import { ProcessVideoService } from "../process-video.service.js";
import { VideoRepository } from "../video.repository.js";

@injectable()
export class ProcessVideoEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoProcessor: ProcessVideoService,
    private readonly videoRepository: VideoRepository,
    private readonly youtubeApiGetVideo: YoutubeApiGetVideo
  ) {
    this.logger.setContext(ProcessVideoEntryUseCase.name);
  }

  public async execute(
    entry: VideoEntryRow
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Fetching video ${entry.id} via Youtube.`);

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(entry.id);

    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId: entry.id },
      });

      return Failure(videoDtoResult.error);
    }

    const videoDto = videoDtoResult.value;

    this.logger.info(`Processing and saving video ${videoDto.id} into db.`);

    const processVideoResult = await this.videoProcessor.process(videoDto);

    const { video, autoCaptions, manualCaptions } = processVideoResult;
    const captions = [...(autoCaptions ?? []), ...(manualCaptions ?? [])];

    const createVideoResult = await this.videoRepository.createWithCaptions(
      video,
      captions
    );

    if (!createVideoResult.ok) {
      this.logger.error({
        message: `Failed to create video ${video.id} with ${captions.length} captions.`,
        error: createVideoResult.error,
      });

      return Failure({
        type: "VIDEO_PERSISTING_FAILED",
        error: createVideoResult.error,
      });
    }

    this.logger.info(
      `Video ${video.id} persisted. autoCaptions=${autoCaptions?.length ?? 0
      }, manualCaptions=${manualCaptions?.length ?? 0}.`
    );

    return Success(undefined);
  }
}
