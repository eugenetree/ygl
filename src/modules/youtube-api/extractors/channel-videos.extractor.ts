import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import {
  ParsingError,
  ValidationError,
} from "../../_common/validation/errors.js";
import { validator } from "../../_common/validation/validator.js";
import { videoDurationParser } from "../parsers/video-duration.parser.js";
import { viewCountParser } from "../parsers/view-count.parser.js";
import { inputSchemas, outputSchemas } from "./channel-videos.schemas.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";

type ChannelVideo = {
  id: string;
  thumbnail?: string;
  title: string;
  duration: number;
  viewCount: number;
}

type Token = string | undefined;

/**
 * This is not used anymore after the migration to yt-dlp.
 */
export class ChannelVideosExtractor {
  private logger = new Logger({ context: ChannelVideosExtractor.name });

  extractFromHtml(
    html: unknown,
  ): Result<
    { videos: ChannelVideo[]; token: Token },
    ValidationError | ParsingError
  > {
    const rawInitialResponseResult = jsonFromHtmlExtractor.getInitialData(html);
    if (!rawInitialResponseResult.ok) {
      return Failure(rawInitialResponseResult.error);
    }

    const initialResponse = inputSchemas.initialResponse.safeParse(
      rawInitialResponseResult.value,
    );

    if (!initialResponse.success) {
      return Failure({
        type: "VALIDATION_ERROR",
        cause: initialResponse.error,
      });
    }

    const tabs =
      initialResponse.data.contents.twoColumnBrowseResultsRenderer.tabs;

    let videoTab: z.infer<typeof inputSchemas.videoTab> | undefined;

    for (const tab of tabs) {
      const tabParseResult = inputSchemas.videoTab.safeParse(tab);

      if (tabParseResult.success) {
        videoTab = tabParseResult.data;
        break;
      }
    }

    if (!videoTab) {
      return Success({ videos: [], token: "" });
    }

    const videoContents =
      videoTab.tabRenderer.content.richGridRenderer.contents;

    let outputToken: Token = "";
    const outputVideos: ChannelVideo[] = [];

    for (const renderer of videoContents) {
      const isRichItemRenderer = "richItemRenderer" in renderer;
      const isContinuationItemRenderer = "continuationItemRenderer" in renderer;

      if (isRichItemRenderer) {
        const videoRenderer = renderer.richItemRenderer.content.videoRenderer;

        if (!videoRenderer.viewCountText?.simpleText) {
          this.logger.info(
            `Video ${videoRenderer.videoId} is missing view count. ` +
            `Most likely it only for sponsors.`,
          );

          continue;
        }

        outputVideos.push({
          id: videoRenderer.videoId,
          thumbnail: videoRenderer.thumbnail.thumbnails[0].url,
          title: videoRenderer.title.runs[0].text,
          viewCount: this.processViewCount(
            videoRenderer.viewCountText.simpleText,
          ),
          duration: this.processDuration(videoRenderer.lengthText.simpleText),
        });
      }

      if (isContinuationItemRenderer) {
        outputToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

    return Success({ videos: outputVideos, token: outputToken });
  }

  extractFromJson(json: unknown): Result<
    z.infer<typeof outputSchemas.result>,
    ValidationError | ParsingError
  > {
    const initialResponse = validator.validate(inputSchemas.jsonResponse, json);

    if (!initialResponse.ok) {
      return Failure(initialResponse.error);
    }

    let outputContinuationToken: string;
    const outputVideos: ChannelVideo[] = [];

    const continuationItems =
      initialResponse.value.onResponseReceivedActions[0]
        .appendContinuationItemsAction.continuationItems;

    for (const renderer of continuationItems) {
      const isRichItemRenderer = "richItemRenderer" in renderer;
      const isContinuationItemRenderer = "continuationItemRenderer" in renderer;

      if (isRichItemRenderer) {
        const videoRenderer = renderer.richItemRenderer.content.videoRenderer;

        if (!videoRenderer.viewCountText?.simpleText) {
          this.logger.info(
            `Video ${videoRenderer.videoId} is missing view count. ` +
            `Most likely it only for sponsors.`,
          );

          continue;
        }

        outputVideos.push({
          id: videoRenderer.videoId,
          thumbnail: videoRenderer.thumbnail.thumbnails[0].url,
          title: videoRenderer.title.runs[0].text,
          viewCount: this.processViewCount(
            videoRenderer.viewCountText.simpleText,
          ),
          duration: this.processDuration(videoRenderer.lengthText.simpleText),
        });
      }

      if (isContinuationItemRenderer) {
        outputContinuationToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

    const outputResult = outputSchemas.result.safeParse({
      videos: outputVideos,
      token: outputContinuationToken!,
    });

    if (!outputResult.success) {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "Could not parse output result",
        cause: outputResult.error,
        context: { outputVideos, outputContinuationToken: outputContinuationToken! },
      })
    }

    return Success(outputResult.data);
  }

  private processViewCount(viewCount: string): number {
    const parseResult = viewCountParser.parse(viewCount);
    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse view count",
        error: parseResult.error,
      });

      return 0;
    }

    return parseResult.value;
  }

  private processDuration(duration: string): number {
    const parseResult = videoDurationParser.parse(duration);
    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse duration",
        error: parseResult.error,
      });

      return 0;
    }

    return parseResult.value;
  }
}

export const channelVideosExtractor = new ChannelVideosExtractor();
