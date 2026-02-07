import { Failure, Result, Success } from "../../types/index.js";
import { FetchError } from "../_common/http/errors.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError, ValidationError } from "../_common/validation/errors.js";
import { Video } from "./youtube-api.types.js";
import { youtubeApiGetChannelVideoEntries } from "./yt-api-get-channel-video-entries.js";
import { youtubeApiGetVideo } from "./yt-api-get-video.js";

type GeneratorChunk =
  | {
      status: "done";
      channelId: string;
    }
  | {
      status: "found";
      channelId: string;
      video: Video;
    };

export class YoutubeApiGetChannelVideos {
  private logger = new Logger({ context: YoutubeApiGetChannelVideos.name });

  public async *getChannelVideos(
    channelId: string,
  ): AsyncGenerator<
    Result<GeneratorChunk, FetchError | ParsingError | ValidationError>,
    void,
    unknown
  > {
    const entriesGenerator =
      youtubeApiGetChannelVideoEntries.getChannelVideoEntries({
        channelId,
      });

    for await (const videoEntriesResult of entriesGenerator) {
      if (!videoEntriesResult.ok) {
        yield Failure(videoEntriesResult.error);

        return;
      }

      const { status } = videoEntriesResult.value;

      console.log("debug: status", status);
      if (status === "done") {
        yield Success({
          status: "done",
          channelId,
        });

        return;
      }

      const { chunk: videoEntries } = videoEntriesResult.value;

      for (const videoEntry of videoEntries) {
        const videoResult = await youtubeApiGetVideo.getVideo(videoEntry.id);

        console.log("debug: videoResult", videoResult);

        if (!videoResult.ok) {
          yield Failure(videoResult.error);

          return;
        }

        yield Success({
          status: "found",
          channelId,
          video: videoResult.value,
        });
      }
    }
  }
}

export const youtubeApiGetChannelVideos = new YoutubeApiGetChannelVideos();
