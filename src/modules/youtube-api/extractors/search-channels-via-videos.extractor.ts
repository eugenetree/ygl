import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import {
  ParsingError,
  ValidationError,
} from "../../_common/validation/errors.js";
import { validator } from "../../_common/validation/validator.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";
import { inputSchemas, outputSchemas } from "./search-channels-via-videos.schemas.js";

class SearchChannelsViaVideosExtractor {
  private logger = new Logger({ context: SearchChannelsViaVideosExtractor.name });

  extractFromHtml(
    html: unknown,
  ): Result<
    z.infer<typeof outputSchemas.result>,
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

    let outputContinuationToken: string;
    const channelsMap = new Map<string, { id: string; name: string }>();

    const contents =
      initialResponse.data.contents.twoColumnSearchResultsRenderer
        .primaryContents.sectionListRenderer.contents;

    for (const renderer of contents) {
      const isItemSectionRenderer = "itemSectionRenderer" in renderer;
      const isContinuationItemRenderer = "continuationItemRenderer" in renderer;

      if (isItemSectionRenderer) {
        for (const videoRenderer of renderer.itemSectionRenderer.contents) {
          const videoRendererResult =
            inputSchemas.videoRenderer.safeParse(videoRenderer);

          if (!videoRendererResult.success) {
            // Skip non-video items (ads, shelves, etc.)
            continue;
          }

          const channels = this.extractChannelsFromVideo(
            videoRendererResult.data.videoRenderer,
          );

          // Add all channels from this video (handles both single and collaborative videos)
          for (const channel of channels) {
            // Deduplicate by channel ID
            if (!channelsMap.has(channel.id)) {
              channelsMap.set(channel.id, channel);
            }
          }
        }
      }

      if (isContinuationItemRenderer) {
        outputContinuationToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

    const outputChannels = Array.from(channelsMap.values());

    const outputResult = validator.validate(outputSchemas.result, {
      channels: outputChannels,
      token: outputContinuationToken!,
    });

    if (!outputResult.ok) {
      return outputResult;
    }

    return Success(outputResult.value);
  }

  extractFromJson(
    json: unknown,
  ): Result<
    z.infer<typeof outputSchemas.result>,
    ValidationError | ParsingError
  > {
    const initialResponse = validator.validate(inputSchemas.jsonResponse, json);

    if (!initialResponse.ok) {
      return Failure(initialResponse.error);
    }

    let outputContinuationToken: string | undefined;
    const channelsMap = new Map<string, { id: string; name: string }>();

    const continuationItems =
      initialResponse.value.onResponseReceivedCommands[0]
        .appendContinuationItemsAction.continuationItems;

    for (const renderer of continuationItems) {
      const isItemSectionRenderer = "itemSectionRenderer" in renderer;
      const isContinuationItemRenderer = "continuationItemRenderer" in renderer;

      if (isItemSectionRenderer) {
        for (const nestedRenderer of renderer.itemSectionRenderer.contents) {
          if ("messageRenderer" in nestedRenderer) {
            return Success({ channels: [] });
          }

          const videoRendererResult =
            inputSchemas.videoRenderer.safeParse(nestedRenderer);

          if (!videoRendererResult.success) {
            // Skip non-video items
            continue;
          }

          const channels = this.extractChannelsFromVideo(
            videoRendererResult.data.videoRenderer,
          );

          // Add all channels from this video (handles both single and collaborative videos)
          for (const channel of channels) {
            // Deduplicate by channel ID
            if (!channelsMap.has(channel.id)) {
              channelsMap.set(channel.id, channel);
            }
          }
        }
      }

      if (isContinuationItemRenderer) {
        outputContinuationToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

    const outputChannels = Array.from(channelsMap.values());

    const outputResult = validator.validate(outputSchemas.result, {
      channels: outputChannels,
      token: outputContinuationToken,
    });

    if (!outputResult.ok) {
      return Failure(outputResult.error);
    }

    return Success(outputResult.value);
  }

  private extractChannelsFromVideo(
    videoRenderer: z.infer<
      typeof inputSchemas.videoRenderer
    >["videoRenderer"],
  ): Array<{ id: string; name: string }> {
    // Check if we have the necessary channel data
    if (!videoRenderer.longBylineText) {
      return [];
    }

    const channelInfo = videoRenderer.longBylineText.runs[0];
    const navigationEndpoint = channelInfo.navigationEndpoint;

    // Handle collaborative videos with multiple channels
    if ("showDialogCommand" in navigationEndpoint) {
      const listItems =
        navigationEndpoint.showDialogCommand.panelLoadingStrategy.inlineContent
          .dialogViewModel.customContent.listViewModel.listItems;

      return listItems.map((item) => ({
        id: item.listItemViewModel.rendererContext.commandContext.onTap
          .innertubeCommand.browseEndpoint.browseId,
        name: item.listItemViewModel.title.content,
      }));
    }

    // Handle regular videos with single channel
    if ("browseEndpoint" in navigationEndpoint) {
      return [
        {
          id: navigationEndpoint.browseEndpoint.browseId,
          name: channelInfo.text,
        },
      ];
    }

    // Should never reach here due to schema validation, but return empty for safety
    return [];
  }
}

export const searchChannelsViaVideosExtractor = new SearchChannelsViaVideosExtractor();
