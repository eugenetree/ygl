import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import {
  ParsingError,
  ValidationError,
} from "../../_common/validation/errors.js";
import { validator } from "../../_common/validation/validator.js";
import { abbreviatedNumberParser } from "../parsers/abbreviated-number.parser.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";
import { inputSchemas, outputSchemas } from "./search-channels.schemas.js";

class SearchChannelsExtractor {
  private logger = new Logger({ context: SearchChannelsExtractor.name });

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
    const outputChannels: z.infer<typeof outputSchemas.result>["channels"] = [];

    const contents =
      initialResponse.data.contents.twoColumnSearchResultsRenderer
        .primaryContents.sectionListRenderer.contents;

    for (const renderer of contents) {
      const isItemSectionRenderer = "itemSectionRenderer" in renderer;
      const isContinuationItemRenderer = "continuationItemRenderer" in renderer;

      if (isItemSectionRenderer) {
        for (const channelRenderer of renderer.itemSectionRenderer.contents) {
          const channelRendererResult =
            inputSchemas.channelRenderer.safeParse(channelRenderer);

          if (!channelRendererResult.success) {
            // TODO: further investigation is needed
            // This helps us to ignore some unknown items, however potentially it also increases uncertainty
            // as we might accidentally ignore some chnages in YT response (e.g. new fields in chanelRenderer, etc)
            continue;
          }

          outputChannels.push(
            this.prepareOutputChannel(
              channelRendererResult.data.channelRenderer,
            ),
          );
        }
      }

      if (isContinuationItemRenderer) {
        outputContinuationToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

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
    const outputChannels: z.infer<typeof outputSchemas.result>["channels"] = [];

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

          outputChannels.push(
            this.prepareOutputChannel(nestedRenderer.channelRenderer),
          );
        }
      }

      if (isContinuationItemRenderer) {
        outputContinuationToken =
          renderer.continuationItemRenderer.continuationEndpoint
            .continuationCommand.token;
      }
    }

    const outputResult = validator.validate(outputSchemas.result, {
      channels: outputChannels,
      token: outputContinuationToken,
    });

    if (!outputResult.ok) {
      return Failure(outputResult.error);
    }

    return Success(outputResult.value);
  }

  private prepareOutputChannel(
    channelRenderer: z.infer<
      typeof inputSchemas.channelRenderer
    >["channelRenderer"],
  ): {
    id: string;
    name: string;
    subscriberCount?: number;
  } {
    const subscriberCountString = channelRenderer.videoCountText?.simpleText;

    if (subscriberCountString === undefined) {
      return {
        id: channelRenderer.channelId,
        name: channelRenderer.title.simpleText,
      };
    }

    const subscriberCountResult = abbreviatedNumberParser.parse(
      subscriberCountString,
    );

    if (!subscriberCountResult.ok) {
      this.logger.error({
        message: "Could not parse subscriber count",
        error: subscriberCountResult.error,
        context: {
          channelId: channelRenderer.channelId,
          subscriberCountString,
        },
      });

      return {
        id: channelRenderer.channelId,
        name: channelRenderer.title.simpleText,
      };
    }

    return {
      id: channelRenderer.channelId,
      name: channelRenderer.title.simpleText,
      subscriberCount: subscriberCountResult.value,
    };
  }
}

export const searchChannelsExtractor = new SearchChannelsExtractor();
