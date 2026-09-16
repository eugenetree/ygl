import { injectable } from "inversify";
import { z } from "zod";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ValidationError } from "../_common/validation/errors.js";
import { validator } from "../_common/validation/validator.js";
import { YtDlpClient, YtDlpError } from "./yt-dlp-client.js";

export type ChannelNotFoundError = {
  type: "CHANNEL_NOT_FOUND";
  channelId: string;
};

export type ChannelNoVideosTabError = {
  type: "CHANNEL_NO_VIDEOS_TAB";
  channelId: string;
};

/** Permanent, known conditions that make a channel un-scrapable, like `UnprocessableVideoError`. */
export type UnprocessableChannelError =
  | ChannelNotFoundError
  | ChannelNoVideosTabError;

const CHANNEL_NOT_FOUND_MESSAGE = "This channel does not exist";
const NO_VIDEOS_TAB_MESSAGE = "This channel does not have a videos tab";

function classifyUnprocessableChannel(
  message: string,
  channelId: string,
): UnprocessableChannelError | null {
  if (message.includes(CHANNEL_NOT_FOUND_MESSAGE)) {
    return { type: "CHANNEL_NOT_FOUND", channelId };
  }
  if (message.includes(NO_VIDEOS_TAB_MESSAGE)) {
    return { type: "CHANNEL_NO_VIDEOS_TAB", channelId };
  }
  return null;
}

export type ChannelVideoEntry = {
  id: string;
  availability: "subscriber_only" | null;
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

const inputSchemas = {
  video: z.object({
    id: z.string(),
    availability: z.enum(["subscriber_only"]).nullish(),
  }),
};

@injectable()
export class YoutubeApiGetChannelVideoEntries {
  constructor(
    private readonly logger: Logger,
    private readonly ytDlpClient: YtDlpClient,
  ) {
    this.logger.setContext(YoutubeApiGetChannelVideoEntries.name);
  }

  public async *getChannelVideoEntries({
    channelId,
  }: {
    channelId: string;
  }): AsyncGenerator<
    Result<
      ChannelVideosResultSuccess,
      YtDlpError | ValidationError | UnprocessableChannelError
    >,
    void,
    undefined
  > {
    this.logger.info(`Getting video entries for channel: ${channelId}`);

    const url = `https://www.youtube.com/channel/${channelId}/videos`;

    const args = [url, "--dump-json", "--flat-playlist", "--lazy-playlist"];

    const stream = this.ytDlpClient.execJsonStream<unknown>(args);
    let foundAny = false;

    for await (const result of stream) {
      if (!result.ok) {
        const unprocessable = classifyUnprocessableChannel(
          result.error.message,
          channelId,
        );

        if (unprocessable) {
          this.logger.info(
            `Channel ${channelId} is unprocessable: ${unprocessable.type}`,
          );
          yield Failure(unprocessable);
          return;
        }

        this.logger.error({
          message: "Error fetching channel video entries via yt-dlp",
          error: result.error,
          context: { channelId },
        });

        yield Failure(result.error);
        return;
      }

      const videoResult = validator.validate(inputSchemas.video, result.value);

      if (!videoResult.ok) {
        this.logger.error({
          message: "Error validating video entry from yt-dlp",
          error: videoResult.error,
          context: { raw: result.value },
        });

        yield Failure(videoResult.error);
        return;
      }

      foundAny = true;

      yield Success({
        status: "found",
        channelId,
        chunk: [
          {
            id: videoResult.value.id,
            availability: videoResult.value.availability ?? null,
          },
        ],
      });
    }

    if (!foundAny) {
      this.logger.info(`No video entries found for channel: ${channelId}`);
    }

    yield Success({
      status: "done",
      channelId,
    });
  }
}
