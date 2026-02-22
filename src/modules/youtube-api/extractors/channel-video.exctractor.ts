import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import {
  ParsingError,
  ValidationError,
} from "../../_common/validation/errors.js";
import { validator } from "../../_common/validation/validator.js";
import { isValidLanguageCode } from "../../i18n/index.js";
import { inputSchemas, outputSchemas } from "./channel-video.schemas.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";

export type OutputVideo = z.infer<typeof outputSchemas.video>;

export class ChannelVideoDetailsExtractor {
  extractInnerTubeApiKey(
    html: unknown,
  ): Result<string, ValidationError | ParsingError> {
    if (typeof html !== "string") {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "Input is not a string",
        context: { html },
      })
    }

    // https://github.com/jdepoix/youtube-transcript-api
    const innertubeApiKeyRegex = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/;
    const apiKey = html.match(innertubeApiKeyRegex)?.[1];

    if (!apiKey) {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "INNERTUBE_API_KEY not found",
        context: { html },
      })
    }

    return Success(apiKey);
  }

  extractFromInnerTubeJson(jsonResponse: unknown) {
    const playerResponseResult = validator.validate(
      inputSchemas.playerResponse,
      jsonResponse,
    );

    if (!playerResponseResult.ok) {
      return Failure(playerResponseResult.error);
    }

    const outputCaptionTracksUrls: OutputVideo["captionTracksUrls"] = {};

    const inputVideoDetails = playerResponseResult.value.videoDetails;
    const inputCaptionTracks =
      playerResponseResult.value.captions?.playerCaptionsTracklistRenderer
        ?.captionTracks;

    for (const inputCaptionTrack of inputCaptionTracks || []) {
      const captionTrackResult = validator.validate(
        inputSchemas.captionTrack,
        inputCaptionTrack,
      );

      if (!captionTrackResult.ok) {
        continue;
      }

      const captionTrack = captionTrackResult.value;
      const languageCode = captionTrack.languageCode.toLowerCase();

      if (!isValidLanguageCode(languageCode)) {
        continue;
      }

      // TODO: check if this is correct
      // initialize object for language code if it doesn't exist
      // as we might have multiple caption tracks for the same language
      if (!outputCaptionTracksUrls[languageCode]) {
        outputCaptionTracksUrls[languageCode] = {
          auto: null,
          manual: null,
        };
      }

      if (captionTrack.kind === "asr") {
        outputCaptionTracksUrls[languageCode].auto = captionTrack.baseUrl;
      } else {
        outputCaptionTracksUrls[languageCode].manual = captionTrack.baseUrl;
      }
    }

    const outputVideo = {
      id: inputVideoDetails.videoId,
      title: inputVideoDetails.title,
      duration: Number(inputVideoDetails.lengthSeconds),
      keywords: inputVideoDetails.keywords || [],
      channelId: inputVideoDetails.channelId,
      viewCount: parseInt(inputVideoDetails.viewCount),
      thumbnail: inputVideoDetails.thumbnail.thumbnails[0].url,

      captionTracksUrls: outputCaptionTracksUrls,
    };

    const outputVideoResult = validator.validate(
      outputSchemas.video,
      outputVideo,
    );

    if (!outputVideoResult.ok) {
      return Failure(outputVideoResult.error);
    }

    return Success(outputVideoResult.value);
  }

  extractFromHtml(
    html: unknown,
  ): Result<OutputVideo, ValidationError | ParsingError> {
    if (typeof html !== "string") {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "Input is not a string",
        context: { html },
      })
    }

    const rawPlayerResponseResult =
      jsonFromHtmlExtractor.getPlayerResponse(html);

    if (!rawPlayerResponseResult.ok) {
      return Failure(rawPlayerResponseResult.error);
    }

    const playerResponseResult = validator.validate(
      inputSchemas.playerResponse,
      rawPlayerResponseResult.value,
    );

    if (!playerResponseResult.ok) {
      return playerResponseResult;
    }

    const outputCaptionTracksUrls: OutputVideo["captionTracksUrls"] = {};

    const inputVideoDetails = playerResponseResult.value.videoDetails;
    const inputCaptionTracks =
      playerResponseResult.value.captions?.playerCaptionsTracklistRenderer
        ?.captionTracks;

    for (const inputCaptionTrack of inputCaptionTracks || []) {
      const captionTrackResult = validator.validate(
        inputSchemas.captionTrack,
        inputCaptionTrack,
      );

      if (!captionTrackResult.ok) {
        continue;
      }

      const captionTrack = captionTrackResult.value;
      const languageCode = captionTrack.languageCode.toUpperCase();

      if (!isValidLanguageCode(languageCode)) {
        continue;
      }

      // initialize object for language code if it doesn't exist
      // as we might have multiple caption tracks for the same language
      if (!outputCaptionTracksUrls[languageCode]) {
        outputCaptionTracksUrls[languageCode] = {
          auto: "",
          manual: "",
        };
      }

      if (captionTrack.kind === "asr") {
        outputCaptionTracksUrls[languageCode].auto = captionTrack.baseUrl;
      } else {
        outputCaptionTracksUrls[languageCode].manual = captionTrack.baseUrl;
      }
    }

    const outputVideo = {
      id: inputVideoDetails.videoId,
      title: inputVideoDetails.title,
      duration: Number(inputVideoDetails.lengthSeconds),
      keywords: inputVideoDetails.keywords || [],
      channelId: inputVideoDetails.channelId,
      viewCount: parseInt(inputVideoDetails.viewCount),
      thumbnail: inputVideoDetails.thumbnail.thumbnails[0].url,
      captionTracksUrls: outputCaptionTracksUrls,
    };

    const outputVideoResult = validator.validate(
      outputSchemas.video,
      outputVideo,
    );

    if (!outputVideoResult.ok) {
      return Failure(outputVideoResult.error);
    }

    return Success(outputVideoResult.value);
  }
}

export const channelVideoDetailsExtractor = new ChannelVideoDetailsExtractor();
