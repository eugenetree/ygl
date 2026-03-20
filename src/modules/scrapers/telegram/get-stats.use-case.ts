import { injectable } from "inversify";

import { Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { JobStats, StatsRepository } from "./stats.repository.js";

@injectable()
export class GetStatsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly statsRepository: StatsRepository,
  ) {
    this.logger.setContext(GetStatsUseCase.name);
  }

  public async execute(): Promise<Result<string, Error>> {
    const result = await this.statsRepository.getStats();

    if (!result.ok) {
      return result;
    }

    const message = this.formatMessage(result.value);
    return Success(message);
  }

  private formatMessage(stats: JobStats): string {
    const formatLine = (label: string, counts: Record<string, number>) =>
      `${label}: ${counts.PENDING} PENDING | ${counts.PROCESSING} PROCESSING | ${counts.SUCCEEDED} SUCCEEDED | ${counts.FAILED} FAILED`;

    return [
      "Job Stats",
      "",
      formatLine("Channel Discovery", stats.channelDiscovery),
      formatLine("Channel", stats.channel),
      formatLine("Video Discovery", stats.videoDiscovery),
      formatLine("Video", stats.video),
      formatLine("Transcription", stats.transcription),
      "",
      `Videos with CAPTIONS_VALID (manual): ${stats.videosWithValidManualCaptions}`,
    ].join("\n");
  }
}
