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
      languageCodeYtdlp: ytData.language ?? null,
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

    const origTrack = ytData.automatic_captions
      ? this.findOrigTrack(ytData.automatic_captions)
      : null;

    if (!origTrack) {
      const hasAnyManual = ytData.subtitles
        ? Object.values(ytData.subtitles).some((formats) => Boolean(formats?.length))
        : false;

      if (hasAnyManual) {
        this.logger.info(`Video ${videoId} has only manual captions (no *-orig auto key).`);
      }

      return Success({
        ...videoBase,
        captionStatus: hasAnyManual ? "MANUAL_ONLY" : "NONE",
        languageCode: null,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    const { language, autoKey } = origTrack;
    this.logger.info(`Detected language: ${language}. Video ID: ${videoId}`);

    const manualKey = ytData.subtitles
      ? this.findMatchingKey(ytData.subtitles, language)
      : null;

    if (!manualKey) {
      this.logger.info(`No manual captions for video ${videoId}, skipping.`);
      return Success({ ...videoBase, captionStatus: "AUTO_ONLY", languageCode: language, autoCaptions: null, manualCaptions: null });
    }

    await new Promise((resolve) => setTimeout(resolve, 5000 + Math.random() * 10000));

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

  private findOrigTrack(
    autoCaptions: Record<string, unknown[]>,
  ): { language: LanguageCode; autoKey: string } | null {
    for (const [key, formats] of Object.entries(autoCaptions)) {
      if (!key.endsWith('-orig') || !formats?.length) continue;
      const lang = key.slice(0, -5).toLowerCase();
      if (!isValidLanguageCode(lang)) {
        this.logger.warn(`*-orig key "${key}" has unsupported language code "${lang}", skipping.`);
        continue;
      }
      return { language: lang, autoKey: key };
    }
    return null;
  }

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

      await new Promise((resolve) => setTimeout(resolve, 5000 + Math.random() * 10000));

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
