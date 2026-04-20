import { injectable } from "inversify";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { YtDlpClient, YtDlpError, MembersOnlyVideoError } from "./yt-dlp-client.js";
import { Logger } from "../_common/logger/logger.js";
import { Failure, Result, Success } from "../../types/index.js";
import { ValidationError } from "../_common/validation/errors.js";
import { LanguageCode, isValidLanguageCode } from "../i18n/index.js";
import { validator } from "../_common/validation/validator.js";
import { captionsExtractor } from "./extractors/captions.extractor.js";
import { Caption, Video } from "./youtube-api.types.js";
import { inputSchemas } from "./yt-api-get-video.schemas.js";

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
  ): Promise<Result<Video, YtDlpError | MembersOnlyVideoError | ValidationError>> {
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

    this.logger.info(`Language from yt-dlp: ${ytData.language}. Video ID: ${videoId}`);

    const language = ytData.language
      ? this.detectLanguage(ytData.language)
      : null;

    if (!language) {
      const hasAnyManual = Boolean(Object.keys(ytData.subtitles || {}).length > 0);
      if (hasAnyManual) this.logger.info(`Video ${videoId} has only manual captions (no detected lang).`);
      return Success({
        ...videoBase,
        captionStatus: hasAnyManual ? "MANUAL_ONLY" : "NONE",
        languageCode: null,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    const autoKey = ytData.automatic_captions
      ? this.findAutoLangKey(ytData.automatic_captions, language)
      : null;

    const manualKey = ytData.subtitles
      ? this.findMatchingKey(ytData.subtitles, language)
      : null;

    if (!autoKey && !manualKey) {
      this.logger.info(`No captions found for video ${videoId}.`);
      return Success({ ...videoBase, captionStatus: "NONE", languageCode: language, autoCaptions: null, manualCaptions: null });
    }
    if (!autoKey) {
      this.logger.info(`No auto captions for video ${videoId}, skipping.`);
      return Success({ ...videoBase, captionStatus: "MANUAL_ONLY", languageCode: language, autoCaptions: null, manualCaptions: null });
    }
    if (!manualKey) {
      this.logger.info(`No manual captions for video ${videoId}, skipping.`);
      return Success({ ...videoBase, captionStatus: "AUTO_ONLY", languageCode: language, autoCaptions: null, manualCaptions: null });
    }

    await new Promise((resolve) => setTimeout(resolve, 20000 + Math.random() * 20000));

    const captionsResult = await this.downloadCaptions(videoId, autoKey, manualKey);
    if (!captionsResult.ok) {
      return Failure(captionsResult.error);
    }

    return Success({
      ...videoBase,
      captionStatus: "BOTH",
      languageCode: language,
      autoCaptions: captionsResult.value.autoCaptions,
      manualCaptions: captionsResult.value.manualCaptions,
    });
  }

  private detectLanguage(
    ytLanguage: string
  ): LanguageCode | null {
    const lang = ytLanguage.toLowerCase();

    if (isValidLanguageCode(lang)) {
      return lang;
    }

    this.logger.warn(
      `Language from yt-dlp ${lang} is not found in supported languages.`
    )

    return null;
  }

  /**
   * For manual captions, find the best match for the given language.
   * Prefer exact match, then prefix match, then base-language match (e.g. en-us vs en-gb).
   */
  private findMatchingKey(
    tracks: Record<string, unknown[]>,
    language: string,
  ): string | null {
    const lowerLang = language.toLowerCase();

    const nonEmptyEntries = Object.entries(tracks)
      .filter(([, formats]) => Boolean(formats?.length));

    const exact = nonEmptyEntries.find(([key]) => key.toLowerCase() === lowerLang);
    if (exact) return exact[0];

    const prefix = nonEmptyEntries.find(([key]) => {
      const lowerKey = key.toLowerCase();
      return lowerKey.startsWith(lowerLang) || lowerLang.startsWith(lowerKey);
    });
    if (prefix) return prefix[0];

    const baseMatch = nonEmptyEntries.find(
      ([key]) => key.toLowerCase().split("-")[0] === lowerLang.split("-")[0]
    );
    if (baseMatch) {
      this.logger.warn(`Manual caption key "${baseMatch[0]}" matched language "${language}" by base language only.`);
      return baseMatch[0];
    }

    return null;
  }

  /**
   * For auto captions, only consider real ASR tracks: prefer {baseLang}-orig, then {baseLang}.
   * Regional variants like en-GB in automatic_captions are machine-translation targets,
   * not downloadable ASR tracks, so we don't use them.
   */
  private findAutoLangKey(
    tracks: Record<string, unknown[]>,
    language: string, // "en-gb", "en"
  ): string | null {
    const baseLang = language.split("-")[0];
    const origKey = `${baseLang}-orig`;
    if (tracks[origKey]?.length) return origKey; // en-orig
    if (tracks[baseLang]?.length) return baseLang; // en
    return null;
  }

  private async downloadCaptions(
    videoId: string,
    autoLang: string,
    manualLang: string,
  ): Promise<Result<{ autoCaptions: Caption[]; manualCaptions: Caption[] }, YtDlpError | MembersOnlyVideoError | ValidationError>> {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "ygl-subs-"));

    try {
      const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);

      // Two separate calls: yt-dlp uses the same filename for both auto and manual,
      // so we download them into separate subdirectories.
      const autoDir = path.join(tmpDir, "auto");
      const manualDir = path.join(tmpDir, "manual");

      const autoResult = await this.ytDlpClient.exec([
        url, "--write-auto-subs", "--sub-format", "json3", "--sub-langs", autoLang, "--skip-download", "--no-warnings", "-o", path.join(autoDir, "%(id)s"),
      ]);
      if (!autoResult.ok) return autoResult;

      await new Promise((resolve) => setTimeout(resolve, 20000 + Math.random() * 20000));

      const manualResult = await this.ytDlpClient.exec([
        url, "--write-subs", "--sub-format", "json3", "--sub-langs", manualLang, "--skip-download", "--no-warnings", "-o", path.join(manualDir, "%(id)s"),
      ]);
      if (!manualResult.ok) return manualResult;

      const autoFile = await this.findSubtitleFile(autoDir);
      const manualFile = await this.findSubtitleFile(manualDir);

      if (!autoFile) {
        return Failure({ type: "YT_DLP_ERROR", message: "yt-dlp produced no auto subtitle file" });
      }
      if (!manualFile) {
        return Failure({ type: "YT_DLP_ERROR", message: "yt-dlp produced no manual subtitle file" });
      }

      const autoCaptions = await this.parseCaptionFile(autoFile, "auto");
      if (!autoCaptions.ok) return autoCaptions;

      const manualCaptions = await this.parseCaptionFile(manualFile, "manual");
      if (!manualCaptions.ok) return manualCaptions;

      return Success({
        autoCaptions: autoCaptions.value,
        manualCaptions: manualCaptions.value,
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    }
  }

  private async findSubtitleFile(dir: string): Promise<string | null> {
    try {
      const files = await readdir(dir);
      const json3File = files.find(f => f.endsWith(".json3"));
      return json3File ? path.join(dir, json3File) : null;
    } catch {
      return null;
    }
  }

  private async parseCaptionFile(
    filePath: string,
    type: "auto" | "manual",
  ): Promise<Result<Caption[], ValidationError>> {
    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content);

    const extractResult = captionsExtractor.extractFromJson({ jsonResponse: json, type });
    if (!extractResult.ok) {
      return extractResult;
    }

    return Success(
      extractResult.value.map((caption) => {
        const { textSegments, ...rest } = caption;
        return {
          ...rest,
          text: textSegments.map((segment) => segment.utf8).join(""),
        };
      }),
    );
  }
}
