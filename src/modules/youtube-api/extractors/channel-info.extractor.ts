import * as fs from "fs";
import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import {
  ParsingError,
  ValidationError,
} from "../../_common/validation/errors.js";
import { schemaForType } from "../../_common/validation/types.js";
import { validator } from "../../_common/validation/validator.js";
import {
  CountryCode,
  CountryName,
  countryNameToCodeMap,
} from "../../i18n/index.js";
import { abbreviatedNumberParser } from "../parsers/abbreviated-number.parser.js";
import { channelCreatedDateParser } from "../parsers/channel-created-date.parser.js";
import { usernameParser } from "../parsers/username.parser.js";
import { videoCountParser } from "../parsers/video-count.parser.js";
import { viewCountParser } from "../parsers/view-count.parser.js";
import { Channel } from "../youtube-api.types.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";

const rawChannelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string(),
  // TODO: maybe bring this later
  // keywords: z.string(),
  subscriberCount: z.string().optional(),
  viewCount: z.string().optional(),
  videoCount: z.string().optional(),
  countryName: z.string().optional(),
  isFamilySafe: z.boolean(),
  joinedDateText: z.string().optional(),
  urlWithUsername: z.string().optional(),
  artistBioContent: z.string().optional(),
});

const processedChannelInfoSchema = schemaForType<Channel>()(
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    avatar: z.string(),
    // TODO: maybe bring this later
    // keywords: z.array(z.string()),
    subscriberCount: z.number(),
    viewCount: z.number(),
    videoCount: z.number(),
    countryCode: z.nativeEnum(CountryCode).nullable(),
    isFamilySafe: z.boolean(),
    channelCreatedAt: z.date(),
    username: z.string(),
    isArtist: z.boolean(),
  }),
);

export class ChannelInfoExtractor {
  private readonly logger = new Logger({ context: ChannelInfoExtractor.name });

  extractFromHtml(
    html: unknown,
  ): Result<Channel, ValidationError | ParsingError> {
    const rawInitialResponseResult = jsonFromHtmlExtractor.getInitialData(html);
    if (!rawInitialResponseResult.ok) {
      return Failure(rawInitialResponseResult.error);
    }

    // TODO: convert extractor to use zod instead of chaing of ".?"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const youtubeDataObject = rawInitialResponseResult.value as any;

    const metadataRenderer =
      youtubeDataObject?.metadata?.channelMetadataRenderer;

    const aboutChannelViewModel =
      youtubeDataObject?.onResponseReceivedEndpoints?.[0]
        ?.showEngagementPanelEndpoint?.engagementPanel
        ?.engagementPanelSectionListRenderer?.content?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
        ?.aboutChannelRenderer?.metadata?.aboutChannelViewModel;

    const rawChannelInfo = {
      id: metadataRenderer?.externalId,
      name: metadataRenderer?.title,
      description: metadataRenderer?.description,
      avatar: metadataRenderer?.avatar?.thumbnails?.[0]?.url,
      // TODO: maybe bring this later
      // keywords: metadataRenderer?.keywords,
      subscriberCount: aboutChannelViewModel?.subscriberCountText,
      viewCount: aboutChannelViewModel?.viewCountText,
      videoCount: aboutChannelViewModel?.videoCountText,
      countryName: aboutChannelViewModel?.country,
      isFamilySafe: metadataRenderer?.isFamilySafe,
      joinedDateText: aboutChannelViewModel?.joinedDateText?.content,
      urlWithUsername: aboutChannelViewModel?.canonicalChannelUrl,
      artistBioContent: aboutChannelViewModel?.artistBio?.content,
    };

    const rawChannelInfoParseResult = validator.validate(
      rawChannelInfoSchema,
      rawChannelInfo,
    );

    if (!rawChannelInfoParseResult.ok) {
      return Failure(rawChannelInfoParseResult.error);
    }

    const rawChannelData = rawChannelInfoParseResult.value;

    const processedChannelInfo = {
      id: rawChannelData.id,
      name: rawChannelData.name,
      description: rawChannelData.description.length
        ? rawChannelData.description
        : null,
      avatar: rawChannelData.avatar,
      // TODO: maybe bring this later
      // keywords: this.processKeywords(rawChannelData.keywords),
      subscriberCount: this.processSubscriberCount(
        rawChannelData.subscriberCount,
      ),
      viewCount: this.processViewCount(rawChannelData.viewCount),
      videoCount: this.processVideoCount(rawChannelData.videoCount),
      countryCode: this.processCountryCode(rawChannelData.countryName),
      isFamilySafe: rawChannelData.isFamilySafe,
      channelCreatedAt: this.processCreatedAt(rawChannelData.joinedDateText),
      username: this.processUsername(rawChannelData.urlWithUsername),
      isArtist: Boolean(rawChannelData.artistBioContent?.length),
    };

    const processedChannelInfoParseResult = validator.validate(
      processedChannelInfoSchema,
      processedChannelInfo,
    );

    if (!processedChannelInfoParseResult.ok) {
      return Failure(processedChannelInfoParseResult.error);
    }

    return Success(processedChannelInfoParseResult.value);
  }

  private processKeywords(keywords: string): string[] {
    const pattern = /"([^"]*)"|(\S+)/g;
    const tokens = keywords.match(pattern);

    if (!tokens) {
      if (keywords.length) {
        this.logger.warn(
          "Keywords were presented in response, but could not be parsed" +
          `\nKeywords: ${keywords}`,
        );
      }

      return [];
    }

    // Remove quotes from the resulting tokens
    return tokens.map((token) => token.replace(/^"|"$/g, ""));
  }

  private processSubscriberCount(subscriberCount: string | undefined): number {
    if (subscriberCount === undefined) {
      return 0;
    }

    const parseResult = abbreviatedNumberParser.parse(subscriberCount);
    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse subscriber count",
        error: parseResult.error,
      });

      return 0;
    }

    return parseResult.value;
  }

  private processViewCount(viewCount: string | undefined): number {
    if (typeof viewCount !== "string") {
      return 0;
    }

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

  private processVideoCount(videoCount: string | undefined): number {
    if (typeof videoCount !== "string") {
      return 0;
    }

    const parseResult = videoCountParser.parse(videoCount);
    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse video count",
        error: parseResult.error,
      });

      return 0;
    }

    return parseResult.value;
  }

  private processCountryCode(countryName?: string): CountryCode | null {
    if (typeof countryName !== "string") {
      return null;
    }

    if (!this.isValidCountryName(countryName)) {
      console.warn(
        `Country name "${countryName}" was not found in system. Probably it should be added to the list.`,
      );

      return null;
    }

    return countryNameToCodeMap[countryName];
  }

  private processCreatedAt(joinedDateText: string | undefined): Date | null {
    if (typeof joinedDateText !== "string") {
      return null;
    }

    const parseResult = channelCreatedDateParser.parse(joinedDateText);

    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse created at",
        error: parseResult.error,
      });

      return null;
    }

    return parseResult.value;
  }

  private isValidCountryName(countryName: string): countryName is CountryName {
    return countryName in countryNameToCodeMap;
  }

  private processUsername(urlWithUsername: string | undefined): string | null {
    if (typeof urlWithUsername !== "string") {
      return null;
    }

    const parseResult = usernameParser.parse(urlWithUsername);
    if (!parseResult.ok) {
      this.logger.error({
        message: "Could not parse username",
        error: parseResult.error,
      });

      return null;
    }

    return parseResult.value;
  }
}

export const channelInfoExtractor = new ChannelInfoExtractor();
