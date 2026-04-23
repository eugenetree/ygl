import { injectable } from "inversify";
import { z } from "zod";
import { Failure, Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ValidationError } from "../_common/validation/errors.js";
import { validator } from "../_common/validation/validator.js";
import { YtDlpClient, YtDlpError } from "./yt-dlp-client.js";

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
    availability: z.enum(["subscriber_only"]).nullable(),
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
      YtDlpError | ValidationError
    >,
    void,
    undefined
  > {
    this.logger.info(`Getting video entries for channel: ${channelId}`);

    const url = `https://www.youtube.com/channel/${channelId}/videos`;

    const args = [
      url,
      "--dump-json",
      "--flat-playlist",
      "--no-warnings",
      "--lazy-playlist",
    ];

    const stream = this.ytDlpClient.execJsonStream<unknown>(args);
    let foundAny = false;

    for await (const result of stream) {
      if (!result.ok) {
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
        chunk: [{ id: videoResult.value.id, availability: videoResult.value.availability }],
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
