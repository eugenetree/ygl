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
import { writeFileSync } from "fs";

type GetCaptionsParams = {
  baseUrl: string;
  type: "manual" | "auto"
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
    this.logger.info(`Processing video ${videoId}...`);

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
      duration: Math.round(ytData.duration), // yt-dlp provides seconds, same as old extractor
      keywords: ytData.tags ?? [],
      channelId: ytData.channel_id,
      viewCount: ytData.view_count ? Math.round(ytData.view_count) : 0,
      thumbnail: ytData.thumbnail,
      asr: ytData.asr ? Math.round(ytData.asr) : null,
      abr: ytData.abr ? Math.round(ytData.abr) : null,
      acodec: ytData.acodec ?? null,
      audioChannels: ytData.audio_channels ? Math.round(ytData.audio_channels) : null,
      audioQuality: ytData.audio_quality ?? null,
      isDrc: ytData.is_drc ?? null,
      categories: ytData.categories ?? [],
      track: ytData.track ?? null,
      artist: ytData.artist ?? null,
      album: ytData.album ?? null,
      creator: ytData.creator ?? null,
      uploadedAt: ytData.timestamp ? new Date(ytData.timestamp * 1000) : null,
      description: ytData.description ?? null,
      likeCount: ytData.like_count ? Math.round(ytData.like_count) : null,
      commentCount: ytData.comment_count ? Math.round(ytData.comment_count) : null,
      availability: ytData.availability ?? null,
      playableInEmbed: ytData.playable_in_embed ?? null,
      channelIsVerified: ytData.channel_is_verified ?? null,
      liveStatus: ytData.live_status ?? null,
      ageLimit: ytData.age_limit ?? null,
      mediaType: ytData.media_type ?? null,
    };

    if (!ytData.language) {
      this.logger.warn(`No language detected for video ${videoId}.`);
    }

    const language = ytData.language ? this.detectLanguage(ytData.language) : null;

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

    const autoUrl = this.getCaptionsUrl(ytData.automatic_captions || {}, language);
    if (!autoUrl) {
      return Failure({
        type: "PARSING_ERROR",
        message: "No auto captions found",
        context: { language, availableAuto: Object.keys(ytData.automatic_captions || {}) },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 5000 + Math.random() * 5000));

    const autoCaptionsResult = await this.getCaptions({ baseUrl: autoUrl, type: "auto" });
    if (!autoCaptionsResult.ok) {
      return Failure(autoCaptionsResult.error);
    }

    const manualUrl = this.getCaptionsUrl(ytData.subtitles || {}, language);

    if (!manualUrl) {
      return Success({
        ...videoBase,
        captionStatus: "AUTO_ONLY",
        languageCode: language,
        autoCaptions: autoCaptionsResult.value.captions,
        manualCaptions: null,
      });
    }

    const manualCaptionsResult = await this.getCaptions({ baseUrl: manualUrl, type: "manual" });
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
    ytLanguage: string
  ): LanguageCode | null {
    const lang = ytLanguage.toLowerCase();

    if (isValidLanguageCode(lang)) {
      return lang;
    }

    if (lang.includes("-")) {
      const baseLang = lang.split("-")[0];
      if (isValidLanguageCode(baseLang)) {
        return baseLang;
      }
    }

    return null;
  }

  private getCaptionsUrl(
    captions: Record<string, { ext: string; url: string }[]>,
    language: string
  ): string | undefined {
    // 1. Try exact match
    const exactMatch = captions[language]?.find(track => track.ext === "json3")?.url;
    if (exactMatch) return exactMatch;

    // 2. Try prefix match (e.g. "en" if looking for "en-us")
    const prefixMatch = Object.entries(captions).find(([lang]) => lang.startsWith(language))?.[1]
      ?.find(track => track.ext === "json3")?.url;
    if (prefixMatch) return prefixMatch;

    // 3. Try base language fallback if language contains dash (e.g. "en" if looking for "en-us")
    if (language.includes("-")) {
      const baseLang = language.split("-")[0];
      // Try exact base language first (e.g. "en" before "en-GB")
      const exactBase = captions[baseLang]?.find(track => track.ext === "json3")?.url;
      if (exactBase) {
        this.logger.info(`Captions not found for exact lang ${language}, using fallback lang ${baseLang}`);
        return exactBase;
      }
      // Then iterate all entries with the same base language — don't stop at first match
      // since that entry may not have json3 tracks
      for (const [langCode, tracks] of Object.entries(captions)) {
        if (langCode !== baseLang && langCode.split("-")[0] === baseLang) {
          const url = tracks.find(track => track.ext === "json3")?.url;
          if (url) {
            this.logger.info(`Captions not found for exact lang ${language}, using fallback lang ${langCode}`);
            return url;
          }
        }
      }
    }

    return undefined;
  }

  private async getCaptions({
    baseUrl,
    type,
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
      type,
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
