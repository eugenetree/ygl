import { Failure, Result, Success } from "../../types/index.js";
import { FetchError } from "../_common/http/errors.js";
import { httpClient } from "../_common/http/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError, ValidationError } from "../_common/validation/errors.js";
import { channelVideosExtractor } from "./extractors/channel-videos.extractor.js";

export type ChannelVideoEntry = {
  id: string;
  title: string;
  duration: number;
  viewCount: number;
  thumnbail?: string;
};

type ChannelVideosResultSuccess =
  | {
    status: "found";
    channelId: string;
    chunk: ChannelVideoEntry[];
  }
  | {
    status: "done";
    channelId: string;
  };

/**
 * This is not used anymore after migration to yt-dlp.
 */
export class YoutubeApiGetChannelVideoEntries {
  private logger = new Logger({
    context: YoutubeApiGetChannelVideoEntries.name,
  });

  public async *getChannelVideoEntries({
    channelId,
  }: {
    channelId: string;
  }): AsyncGenerator<
    Result<
      ChannelVideosResultSuccess,
      FetchError | ParsingError | ValidationError
    >
  > {
    this.logger.info(`Getting channel videos for channelId: ${channelId}`);

    const initialResult = await this.getChannelVideosInitial(channelId);
    if (!initialResult.ok) {
      this.logger.error({
        message: "Error getting channel videos",
        error: initialResult.error,
        context: { channelId },
      });

      yield Failure(initialResult.error);

      return;
    }

    const videos = initialResult.value.videos;
    if (!videos.length) {
      this.logger.info(
        `No videos found for channelId: ${channelId} from initial search`,
      );

      yield Success({
        status: "done",
        channelId,
      });

      return;
    }

    let token = initialResult.value.token;

    this.logger.info(
      `Found ${videos.length} videos for channel: ${channelId} from initial search`,
    );

    yield Success({
      status: "found",
      channelId,
      chunk: videos,
    });

    while (token) {
      this.logger.info(`Searching for more videos for channel: ${channelId}.`);

      const continuationResult = await this.getChannelVideosContinuation(token);
      if (!continuationResult.ok) {
        yield Failure(continuationResult.error);
        return;
      }

      const videos = continuationResult.value.videos;
      if (!videos.length) {
        this.logger.info(
          `No videos found for channelId: ${channelId} from continuation search`,
        );

        yield Success({
          status: "done",
          channelId,
        });

        return;
      }

      this.logger.info(
        `Found ${videos.length} videos for channel: ${channelId} from continuation search`,
      );

      yield Success({
        status: "found",
        channelId,
        chunk: videos,
      });

      token = continuationResult.value.token;
    }
  }

  private async getChannelVideosInitial(channelId: string) {
    const url = encodeURI(`https://youtube.com/channel/${channelId}/videos`);

    const responseResult = await httpClient.get(url);
    if (!responseResult.ok) {
      return Failure(responseResult.error);
    }

    const videosResult = channelVideosExtractor.extractFromHtml(
      responseResult.value,
    );

    if (!videosResult.ok) {
      return Failure(videosResult.error);
    }

    return Success(videosResult.value);
  }

  private async getChannelVideosContinuation(token: string) {
    const url = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";

    const responseResult = await httpClient.post(url, {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240906.01.00",
          },
        },
        continuation: token,
      }),
    });

    if (!responseResult.ok) {
      this.logger.error({
        message: "Error getting channel videos",
        error: responseResult.error,
        context: { token },
      });

      return Failure(responseResult.error);
    }

    const videosResult = channelVideosExtractor.extractFromJson(
      responseResult.value,
    );

    if (!videosResult.ok) {
      this.logger.error({
        message: "Error getting channel videos",
        error: videosResult.error,
        context: { token },
      });

      return Failure(videosResult.error);
    }

    return Success(videosResult.value);
  }
}