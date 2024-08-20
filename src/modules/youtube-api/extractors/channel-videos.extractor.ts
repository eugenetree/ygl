import { Failure, Result, Success } from "../../../types";
import { z } from "zod";
import { ValidationError } from "../../_common/validation/errors";

type ChannelVideo = z.infer<typeof channelVideoSchema>;
type Token = z.infer<typeof tokenSchema>;

const channelVideoSchema = z.object({
  id: z.string(),
  thumbnail: z.string().optional(),
  title: z.string(),
  duration: z.string(),
  viewCount: z.string(),
});

const tokenSchema = z.string().min(1);

export class ChannelVideosExtractor {
  getChannelVideos(
    youtubeDataObject: any
  ): Result<{ videos: ChannelVideo[]; token: Token }, ValidationError> {
    const resultVideos: ChannelVideo[] = [];
    let resultToken: Token = "";

    const videoTab =
      youtubeDataObject?.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
        (tab: any) => {
          return tab.tabRenderer.title === "Videos";
        }
      );

    if (!videoTab) {
      return Failure(new ValidationError("Could not find the video tab"));
    }

    const videoContents =
      videoTab?.tabRenderer?.content?.richGridRenderer?.contents;

    if (!videoContents) {
      return Failure(new ValidationError("Could not find the video contents"));
    }

    let i = 0;

    for (const videoContent of videoContents) {
      console.log(i++);
      const token =
        videoContent?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token;

      if (token) {
        resultToken = token;
        continue;
      }

      const videoRenderer =
        videoContent?.richItemRenderer?.content?.videoRenderer;

      if (!videoRenderer) {
        return Failure(
          new ValidationError("Error with accessing videoRenderer object")
        );
      }

      const videoThumbnails = videoRenderer?.thumbnail?.thumbnails;

      const videoItem = {
        id: videoRenderer?.videoId,
        thumbnail: videoThumbnails[videoThumbnails.length - 1]?.url,
        title: videoRenderer?.title?.runs?.[0]?.text,
        viewCount: videoRenderer?.viewCountText?.simpleText,
        duration: videoRenderer?.lengthText?.simpleText,
      };

      const videoParseResult = channelVideoSchema.safeParse(videoItem);

      if (!videoParseResult.success)
        return Failure(
          new ValidationError({
            message:
              "Error with parsing data for one of the videos, most likely something's changed for all content",
            error: videoParseResult.error,
          })
        );

      resultVideos.push(videoParseResult.data);
    }

    const tokenParseResult = tokenSchema.safeParse(resultToken);

    if (!tokenParseResult.success) {
      return Failure(
        new ValidationError({
          message:
            "Error with parsing continuation token. It should've been parsed, but it wasn't",
          error: tokenParseResult.error,
        })
      );
    }

    return Success({ videos: resultVideos, token: resultToken });
  }
}

export const channelVideosExtractor = new ChannelVideosExtractor();
