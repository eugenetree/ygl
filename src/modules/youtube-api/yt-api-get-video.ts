import { inject, injectable } from "inversify";
import { YtDlpClient, YtDlpError } from "./yt-dlp-client.js";
import { Logger } from "../_common/logger/logger.js";
import { Failure, Result, Success } from "../../types/index.js";
import { ParsingError, ValidationError } from "../_common/validation/errors.js";
import { FetchError } from "../_common/http/errors.js";
import { httpClient } from "../_common/http/index.js";
import { LanguageCode, isValidLanguageCode } from "../i18n/index.js";
import { validator } from "../_common/validation/validator.js";
import { captionsExtractor } from "./extractors/captions.extractor.js";
import { Caption, Video } from "./youtube-api.types.js";
import { inputSchemas } from "./yt-api-get-video.schemas.js";

type GetCaptionsParams = {
  baseUrl: string;
};

@injectable()
export class YoutubeApiGetVideo {
  constructor(
    private readonly logger: Logger,
    private readonly ytDlpClient: YtDlpClient
  ) {
    this.logger.setContext(YoutubeApiGetVideo.name);
  }

  public async getVideo(
    videoId: string
  ): Promise<Result<Video, YtDlpError | FetchError | ParsingError | ValidationError>> {
    this.logger.info(`Fetching video ${videoId} via yt-dlp...`);

    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    const args = ["--dump-json", "--no-download", "--skip-download", "--no-warnings"];

    const execResult = await this.ytDlpClient.execJson<unknown>([url, ...args]);

    if (!execResult.ok) {
      return execResult;
    }

    if (execResult.value.length === 0) {
      return Failure({
        type: "YT_DLP_ERROR",
        message: "yt-dlp returned no output",
      });
    }

    const jsonResponse = execResult.value[0];
    const validationResult = validator.validate(inputSchemas.ytDlpJson, jsonResponse);

    if (!validationResult.ok) {
      return Failure(validationResult.error);
    }

    const ytData = validationResult.value;

    const videoBase = {
      id: ytData.id,
      title: ytData.title,
      duration: ytData.duration, // yt-dlp provides seconds, same as old extractor
      keywords: ytData.tags ?? [],
      channelId: ytData.channel_id,
      viewCount: ytData.view_count ?? 0,
      thumbnail: ytData.thumbnail,
    };

    const language = this.detectLanguage(ytData.language, ytData.automatic_captions);

    if (!language) {
      const hasManual = ytData.subtitles && Object.keys(ytData.subtitles).length > 0;
      if (hasManual) this.logger.info(`Video ${videoId} has only manual captions (no detected lang).`);
      return Success({
        ...videoBase,
        captionStatus: hasManual ? "MANUAL_ONLY" : "NONE",
        languageCode: null,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    const autoUrl = Object.entries(ytData.automatic_captions || {})
      .find(([lang]) => lang.startsWith(language))?.[1]
      ?.find(track => track.ext === "json3")?.url;

    if (!autoUrl) {
      return Failure({
        type: "PARSING_ERROR",
        message: "No auto captions json3 URL found",
        context: { language, availableAuto: Object.keys(ytData.automatic_captions || {}) },
      });
    }

    const autoCaptionsResult = await this.getCaptions({ baseUrl: autoUrl });
    if (!autoCaptionsResult.ok) {
      return Failure(autoCaptionsResult.error);
    }

    let manualUrl = ytData.subtitles?.[language]?.find(track => track.ext === "json3")?.url;

    if (!manualUrl) {
      // Fallback: check if any manual track shares the same base language
      const baseLang = language.split("-")[0];
      const fallbackEntry = Object.entries(ytData.subtitles || {}).find(
        ([langCode]) => langCode.split("-")[0] === baseLang
      );

      if (fallbackEntry) {
        manualUrl = fallbackEntry[1].find(track => track.ext === "json3")?.url;
        if (manualUrl) {
          this.logger.info(`Manual captions not found for exact lang ${language}, using fallback lang ${fallbackEntry[0]}`);
        }
      }
    }

    if (!manualUrl) {
      return Success({
        ...videoBase,
        captionStatus: "AUTO_ONLY",
        languageCode: language,
        autoCaptions: autoCaptionsResult.value.captions,
        manualCaptions: null,
      });
    }

    const manualCaptionsResult = await this.getCaptions({ baseUrl: manualUrl });
    if (!manualCaptionsResult.ok) {
      return Failure(manualCaptionsResult.error);
    }

    return Success({
      ...videoBase,
      captionStatus: "BOTH",
      languageCode: language,
      autoCaptions: autoCaptionsResult.value.captions,
      manualCaptions: manualCaptionsResult.value.captions,
    });
  }

  private detectLanguage(
    detectLangInfo: string | null | undefined,
    automaticCaptions: Record<string, any[]> | undefined
  ): LanguageCode | null {
    // yt-dlp usually provides the primary language in `language`
    if (detectLangInfo && isValidLanguageCode(detectLangInfo.toLowerCase())) {
      return detectLangInfo.toLowerCase() as LanguageCode;
    }

    // fallback: if we have automatic captions, pick the first valid primary language
    const languagesWithAutoCaptions = Object.keys(automaticCaptions || {});

    if (languagesWithAutoCaptions.length === 0) {
      return null;
    }

    // Try to find common languages first (en, es, fr, etc...)
    // Usually YouTube auto-generates tracking for English first if spoken.
    // If not, we just take the first one that is a standard language code.
    const firstValid = languagesWithAutoCaptions.find(l => isValidLanguageCode(l.toLowerCase()));
    if (!firstValid) {
      return null;
    }

    return firstValid.toLowerCase() as LanguageCode;
  }

  private async getCaptions({
    baseUrl,
  }: GetCaptionsParams): Promise<Result<{ captions: Caption[] }, ParsingError | FetchError | ValidationError>> {
    // yt-dlp urls are already in json3 format based on our filtering,
    // but just to be absolutely safe:
    const finalUrl = baseUrl.replace("fmt=srv1", "fmt=json3").replace("fmt=srv2", "fmt=json3").replace("fmt=srv3", "fmt=json3");

    const captionsResponseResult = await httpClient.get(finalUrl);

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
