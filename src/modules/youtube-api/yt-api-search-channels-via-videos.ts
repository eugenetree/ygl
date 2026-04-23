import { injectable } from "inversify";
import { Failure, Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError } from "../_common/validation/errors.js";
import { ValidationError } from "../_common/validation/errors.js";
import { YtDlpClient, YtDlpError } from "./yt-dlp-client.js";

import { z } from "zod";
import { validator } from "../_common/validation/validator.js";

export type SearchChannelEntry = {
  id: string;
};

const inputSchemas = {
  video: z.object({
    channel_id: z.string().nullable(),
  })
}

const outputSchemas = {
  channelEntry: z.object({
    id: z.string(),
  })
}

type SearchChannelsResultSuccess =
  | {
    status: "found";
    query: string;
    chunk: SearchChannelEntry[];
  }
  | {
    status: "done";
    query: string;
  };

@injectable()
export class YoutubeApiSearchChannelsViaVideos {
  constructor(
    private readonly logger: Logger,
    private readonly ytDlpClient: YtDlpClient,
  ) {
    this.logger.setContext(YoutubeApiSearchChannelsViaVideos.name);
  }

  public async *searchChannels({
    query,
  }: {
    query: string;
  }): AsyncGenerator<
    Result<
      SearchChannelsResultSuccess,
      YtDlpError | ParsingError | ValidationError
    >,
    void,
    undefined
  > {
    this.logger.info(`Searching for channels via CC videos: ${query}`);

    const ccFilter = "EgIoAQ%253D%253D";
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${ccFilter}`;

    const args = [
      url,
      "--dump-json",
      "--flat-playlist",
      "--no-warnings",
      "--lazy-playlist",
    ];

    const stream = this.ytDlpClient.execJsonStream<unknown>(args);
    const channelsMap = new Map<string, SearchChannelEntry>();
    let foundAny = false;

    for await (const result of stream) {
      if (!result.ok) {
        this.logger.error({
          message: "Error searching for channels via yt-dlp",
          error: result.error,
          context: { query },
        });

        yield Failure(result.error);
        return;
      }

      const videoResult = validator.validate(
        inputSchemas.video,
        result.value
      );

      if (!videoResult.ok) {
        this.logger.error({
          message: "Error validating video",
          error: videoResult.error,
          context: { v: result.value },
        });

        yield Failure(videoResult.error);
        return;
      }

      const video = videoResult.value;

      if (video.channel_id) {
        if (!channelsMap.has(video.channel_id)) {
          const channel: SearchChannelEntry = {
            id: video.channel_id,
          };
          channelsMap.set(video.channel_id, channel);
          foundAny = true;

          yield Success({
            status: "found",
            query,
            chunk: [channel],
          });
        }
      }
    }

    if (!foundAny) {
      this.logger.info(`No channels found for query: ${query}.`);
    } else {
      this.logger.info(`Finished discovery for query: ${query}. Found ${channelsMap.size} unique channels.`);
    }

    yield Success({
      status: "done",
      query,
    });
  }
}