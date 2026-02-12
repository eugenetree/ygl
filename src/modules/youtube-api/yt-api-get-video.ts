import { omit } from "lodash-es";

import { Failure, Result, Success } from "../../types/index.js";
import { FetchError } from "../_common/http/errors.js";
import { httpClient } from "../_common/http/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError, ValidationError } from "../_common/validation/errors.js";
import { LanguageCode, isValidLanguageCode } from "../i18n/index.js";
import { captionsExtractor } from "./extractors/captions.extractor.js";
import {
  OutputVideo,
  channelVideoDetailsExtractor,
} from "./extractors/channel-video.exctractor.js";
import { Caption, Video } from "./youtube-api.types.js";

class YoutubeApiGetVideo {
  private logger = new Logger({ context: YoutubeApiGetVideo.name });

  public async getVideo(
    videoId: string,
  ): Promise<Result<Video, FetchError | ParsingError | ValidationError>> {
    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    const watchPageResponseResult = await httpClient.get(url);

    if (!watchPageResponseResult.ok) {
      return Failure(watchPageResponseResult.error);
    }

    const innerTubeApiKeyResult =
      channelVideoDetailsExtractor.extractInnerTubeApiKey(
        watchPageResponseResult.value,
      );

    if (!innerTubeApiKeyResult.ok) {
      return Failure(innerTubeApiKeyResult.error);
    }

    const innerTubeApiKey = innerTubeApiKeyResult.value;

    const innerTubeResult = await httpClient.post(
      `https://www.youtube.com/youtubei/v1/player?key=${innerTubeApiKey}`,
      {
        body: {
          context: {
            client: { clientName: "ANDROID", clientVersion: "20.10.38" },
          },
          videoId: videoId,
        },
      },
    );

    if (!innerTubeResult.ok) {
      return Failure(innerTubeResult.error);
    }

    const videoDetailsResult =
      channelVideoDetailsExtractor.extractFromInnerTubeJson(
        innerTubeResult.value,
      );

    if (!videoDetailsResult.ok) {
      return Failure(videoDetailsResult.error);
    }

    const videoDetails = videoDetailsResult.value;

    if (this.hasOnlyManualCaptionTracks(videoDetails.captionTracksUrls)) {
      this.logger.error({
        message: "TO BE INVESTIGATED: Video has only manual captions and no ASR tracks",
        context: {
          videoId: videoDetails.id,
          captionTracksUrls: videoDetails.captionTracksUrls,
        },
      });
    }

    const videoLanguage = this.getVideoLanguageBasedOnCaptionTracks(
      videoDetails.captionTracksUrls,
    );

    if (!videoLanguage) {
      return Success({
        ...omit(videoDetails, ["captionTracksUrls"]),
        languageCode: null,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    const autoCaptionsTrackUrl =
      videoDetails.captionTracksUrls[videoLanguage]?.auto;

    if (!autoCaptionsTrackUrl) {
      return Failure({
        type: "PARSING_ERROR",
        message: "No auto captions track URL found",
        context: { videoLanguage, videoDetails },
      });
    }

    const autoCaptionsResult = await this.getCaptions({
      baseUrl: autoCaptionsTrackUrl,
    });

    if (!autoCaptionsResult.ok) {
      return Failure(autoCaptionsResult.error);
    }

    const manualCaptionTrackUrl =
      videoDetails.captionTracksUrls[videoLanguage]?.manual;

    if (!manualCaptionTrackUrl) {
      return Success({
        ...omit(videoDetails, ["captionTracksUrls"]),
        languageCode: videoLanguage,
        autoCaptions: autoCaptionsResult.value.captions,
        manualCaptions: null,
      });
    }

    const manualCaptionsResult = await this.getCaptions({
      baseUrl: manualCaptionTrackUrl,
    });

    if (!manualCaptionsResult.ok) {
      return Failure(manualCaptionsResult.error);
    }

    return Success({
      ...omit(videoDetails, ["captionTracksUrls"]),
      languageCode: videoLanguage,
      manualCaptions: manualCaptionsResult.value.captions,
      autoCaptions: autoCaptionsResult.value.captions,
    });
  }

  private getVideoLanguageBasedOnCaptionTracks(
    captionTracksUrls: OutputVideo["captionTracksUrls"],
  ): LanguageCode | null {
    const languagesWithAutoCaptions = Object.keys(captionTracksUrls).filter(
      (language) => captionTracksUrls[language as LanguageCode]?.auto,
    );

    if (languagesWithAutoCaptions.length === 0) {
      return null;
    }

    if (languagesWithAutoCaptions.length > 1) {
      this.logger.warn(
        "TO BE INVESTIGATED:" +
        "More than one language with auto captions, choosing the first one. " +
        "captionTracksUrls: " + JSON.stringify(captionTracksUrls),
      );

      return null;
    }

    const languageCode = languagesWithAutoCaptions[0];

    if (!isValidLanguageCode(languageCode)) {
      return null;
    }

    return languageCode;
  }

  private hasOnlyManualCaptionTracks(
    captionTracksUrls: OutputVideo["captionTracksUrls"],
  ): boolean {
    const captionTracks = Object.values(captionTracksUrls);

    if (captionTracks.length === 0) {
      return false;
    }

    const hasAnyAutoTrack = captionTracks.some((tracks) => Boolean(tracks.auto));
    const hasAnyManualTrack = captionTracks.some((tracks) =>
      Boolean(tracks.manual),
    );

    return hasAnyManualTrack && !hasAnyAutoTrack;
  }

  private async getCaptions({
    baseUrl,
  }: {
    baseUrl: string;
  }): Promise<
    Result<{ captions: Caption[] }, ParsingError | FetchError | ValidationError>
  > {
    const captionsResponseResult = await httpClient.get(
      baseUrl.replace("fmt=srv3", "fmt=json3"),
    );

    if (!captionsResponseResult.ok) {
      return Failure(captionsResponseResult.error);
    }

    const captionsResult = captionsExtractor.extractFromJson({
      jsonResponse: captionsResponseResult.value,
    });

    if (!captionsResult.ok) {
      return Failure(captionsResult.error);
    }

    return Success({
      captions: captionsResult.value.map((caption) => {
        const { textSegments, ...rest } = caption;
        return {
          ...rest,
          text: textSegments.map((segment) => segment.utf8).join(""),
        };
      }),
    });
  }
}

export const youtubeApiGetVideo = new YoutubeApiGetVideo();
