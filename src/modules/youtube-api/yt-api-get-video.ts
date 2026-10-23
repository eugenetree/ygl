import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { inject, injectable } from "inversify";
import { z } from "zod";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ValidationError } from "../_common/validation/errors.js";
import { validator } from "../_common/validation/validator.js";
import { isValidLanguageCode, type LanguageCode } from "../i18n/index.js";
import { captionsExtractor } from "./extractors/captions.extractor.js";
import {
  type CaptionTrackKind,
  RAW_DATA_STORE,
  type RawDataStorageError,
  type RawDataStore,
} from "./raw-data-store.js";
import { Caption, CaptionTrackState, Video } from "./youtube-api.types.js";
import { inputSchemas } from "./yt-api-get-video.schemas.js";
import {
  UnprocessableVideoError,
  YtDlpClient,
  YtDlpError,
} from "./yt-dlp-client.js";
import { YtDlpResponseRecorder } from "./yt-dlp-response-recorder.js";

type Format = NonNullable<
  z.infer<typeof inputSchemas.ytDlpJson>["formats"]
>[number];

export type AmbiguousVideoLanguageError = {
  type: "AMBIGUOUS_VIDEO_LANGUAGE";
  videoId: string;
  markLanguages: string[];
  audioLanguages: string[];
  origKeys: string[];
};

const baseCode = (code: string): string =>
  code.toLowerCase().split("-")[0] ?? "";

const distinctBaseCodes = (formats: Format[]): string[] => {
  const codes = new Set<string>();
  for (const f of formats) {
    if (f.language) codes.add(baseCode(f.language));
  }
  return [...codes];
};

// yt-dlp's language_preference for audio YouTube names "… original".
const isMarkedOriginal = (f: Format): boolean => f.language_preference === 10;

@injectable()
export class YoutubeApiGetVideo {
  constructor(
    private readonly logger: Logger,
    private readonly ytDlpClient: YtDlpClient,
    @inject(RAW_DATA_STORE) private readonly rawDataStore: RawDataStore,
    private readonly responseRecorder?: YtDlpResponseRecorder,
  ) {
    this.logger.setContext(YoutubeApiGetVideo.name);
  }

  /**
   * Fetches a video and, before returning, stores its raw video info (on every
   * outcome) and, when both were downloaded, its raw caption tracks in the raw
   * data store. A storage failure is returned as a RawDataStorageError, even
   * when the video would otherwise have been returned or skipped.
   */
  public async getVideo(
    videoId: string,
  ): Promise<
    Result<
      Video,
      | YtDlpError
      | UnprocessableVideoError
      | ValidationError
      | AmbiguousVideoLanguageError
      | RawDataStorageError
    >
  > {
    this.logger.info(`Processing video ${videoId}...`);

    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    // Without --no-playlist, a multi-camera video comes back as one JSON line
    // per feed, each under a different id.
    const args = [
      "--dump-json",
      "--no-download",
      "--skip-download",
      "--no-playlist",
    ];

    const execResult = await this.ytDlpClient.execJson<unknown>(
      [url, ...args],
      { diagnoseUnavailable: true },
    );
    await this.responseRecorder?.record(videoId, execResult);

    const fetchedAt = new Date().toISOString();
    const storeResult = await this.rawDataStore.storeRawVideoInfo(
      videoId,
      fetchedAt,
      execResult,
    );
    if (!storeResult.ok) {
      return storeResult;
    }

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
    const validationResult = validator.validate(
      inputSchemas.ytDlpJson,
      jsonResponse,
    );

    if (!validationResult.ok) {
      return Failure(validationResult.error);
    }

    const ytData = validationResult.value;

    // yt-dlp answers a Premium-only video with its free trailer, exiting 0;
    // the differing id is the only trace of the swap.
    if (ytData.id !== videoId) {
      return Failure({
        type: "PREMIUM_ONLY_VIDEO",
        message: `yt-dlp returned ${ytData.id} in place of ${videoId}, the trailer YouTube offers for a Premium-only video`,
      });
    }

    const decision = this.decideVideoLanguage(
      videoId,
      ytData.automatic_captions ?? {},
      ytData.formats ?? [],
    );

    if (!decision.ok) {
      return decision;
    }

    const { language, autoKey, originalAudioLanguage } = decision.value;

    const videoBase = {
      id: ytData.id,
      title: ytData.title,
      duration: Math.round(ytData.duration), // yt-dlp provides seconds, same as old extractor
      keywords: ytData.tags ?? [],
      channelId: ytData.channel_id,
      viewCount: ytData.view_count ? Math.round(ytData.view_count) : 0,
      thumbnail: ytData.thumbnail,
      languageCodeYtdlp: ytData.language ?? null,
      originalAudioLanguage,
      asr: ytData.asr ? Math.round(ytData.asr) : null,
      abr: ytData.abr ? Math.round(ytData.abr) : null,
      acodec: ytData.acodec ?? null,
      audioChannels: ytData.audio_channels
        ? Math.round(ytData.audio_channels)
        : null,
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
      commentCount: ytData.comment_count
        ? Math.round(ytData.comment_count)
        : null,
      availability: ytData.availability ?? null,
      playableInEmbed: ytData.playable_in_embed ?? null,
      channelIsVerified: ytData.channel_is_verified ?? null,
      liveStatus: ytData.live_status ?? null,
      ageLimit: ytData.age_limit ?? null,
      mediaType: ytData.media_type ?? null,
    };

    if (!language) {
      const hasAnyManual = ytData.subtitles
        ? Object.values(ytData.subtitles).some((formats) =>
            Boolean(formats?.length),
          )
        : false;

      if (hasAnyManual) {
        this.logger.info(
          `Video ${videoId} has only manual captions (no video language).`,
        );
      }

      return Success({
        ...videoBase,
        languageCode: null,
        autoCaptions: { state: "ABSENT" },
        manualCaptions: hasAnyManual
          ? { state: "PRESENT_NOT_FETCHED" }
          : { state: "ABSENT" },
      });
    }

    this.logger.info(`Detected language: ${language}. Video ID: ${videoId}`);

    const manualKey = ytData.subtitles
      ? this.findMatchingKey(ytData.subtitles, language)
      : null;
    const manualCaptions: CaptionTrackState = manualKey
      ? { state: "PRESENT_NOT_FETCHED" }
      : { state: "ABSENT" };

    if (language !== "en") {
      this.logger.info(
        `Skipping caption fetch for non-English video ${videoId}.`,
      );

      return Success({
        ...videoBase,
        languageCode: language,
        autoCaptions: autoKey
          ? { state: "PRESENT_NOT_FETCHED" }
          : { state: "ABSENT" },
        manualCaptions,
      });
    }

    if (!autoKey) {
      this.logger.info(
        `No auto captions in the original audio's language for video ${videoId}, skipping.`,
      );
      return Success({
        ...videoBase,
        languageCode: language,
        autoCaptions: { state: "ABSENT" },
        manualCaptions,
      });
    }

    if (!manualKey) {
      this.logger.info(`No manual captions for video ${videoId}, skipping.`);
      return Success({
        ...videoBase,
        languageCode: language,
        autoCaptions: { state: "PRESENT_NOT_FETCHED" },
        manualCaptions: { state: "ABSENT" },
      });
    }

    const captionsResult = await this.downloadCaptions(
      videoId,
      fetchedAt,
      autoKey,
      manualKey,
    );
    if (!captionsResult.ok) {
      return Failure(captionsResult.error);
    }

    return Success({
      ...videoBase,
      languageCode: language,
      autoCaptions: {
        state: "FETCHED",
        data: captionsResult.value.autoCaptions,
      },
      manualCaptions: {
        state: "FETCHED",
        data: captionsResult.value.manualCaptions,
      },
    });
  }

  private decideVideoLanguage(
    videoId: string,
    autoCaptions: Record<string, unknown[]>,
    formats: Format[],
  ): Result<
    {
      language: LanguageCode | null;
      autoKey: string | null;
      originalAudioLanguage: string | null;
    },
    AmbiguousVideoLanguageError
  > {
    const audioFormats = formats.filter((f) => f.acodec !== "none");
    const audioLanguages = distinctBaseCodes(audioFormats);
    const markLanguages = distinctBaseCodes(
      audioFormats.filter(isMarkedOriginal),
    );
    const origKeys = Object.keys(autoCaptions).filter(
      (key) => key.endsWith("-orig") && autoCaptions[key]?.length,
    );

    const ambiguous = () =>
      Failure({
        type: "AMBIGUOUS_VIDEO_LANGUAGE" as const,
        videoId,
        markLanguages,
        audioLanguages,
        origKeys,
      });

    const noLanguage = (originalAudioLanguage: string | null) =>
      Success({ language: null, autoKey: null, originalAudioLanguage });

    if (markLanguages.length > 1) {
      return ambiguous();
    }

    const markedLanguage = audioFormats.find(
      (f) => isMarkedOriginal(f) && f.language,
    )?.language;

    if (markedLanguage) {
      const language = baseCode(markedLanguage);
      if (!isValidLanguageCode(language)) {
        this.logger.warn(
          `Original audio of video ${videoId} has unsupported language code "${language}".`,
        );
        return noLanguage(markedLanguage);
      }

      return Success({
        language,
        autoKey: origKeys.find((key) => baseCode(key) === language) ?? null,
        originalAudioLanguage: markedLanguage,
      });
    }

    if (audioLanguages.length > 1 || origKeys.length > 1) {
      return ambiguous();
    }

    const [origKey] = origKeys;
    if (!origKey) {
      return noLanguage(null);
    }

    const language = baseCode(origKey);
    if (!isValidLanguageCode(language)) {
      this.logger.warn(
        `*-orig key "${origKey}" has unsupported language code "${language}", skipping.`,
      );
      return noLanguage(null);
    }

    return Success({ language, autoKey: origKey, originalAudioLanguage: null });
  }

  private findMatchingKey(
    tracks: Record<string, unknown[]>,
    language: string,
  ): string | null {
    const lowerLang = language.toLowerCase();

    const nonEmptyEntries = Object.entries(tracks).filter(([, formats]) =>
      Boolean(formats?.length),
    );

    const exact = nonEmptyEntries.find(
      ([key]) => key.toLowerCase() === lowerLang,
    );
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
    fetchedAt: string,
    autoLang: string,
    manualLang: string,
  ): Promise<
    Result<
      { autoCaptions: Caption[]; manualCaptions: Caption[] },
      | YtDlpError
      | UnprocessableVideoError
      | ValidationError
      | RawDataStorageError
    >
  > {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "ygl-subs-"));

    try {
      const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);

      // Two separate calls: yt-dlp uses the same filename for both auto and manual,
      // so we download them into separate subdirectories.
      const autoDir = path.join(tmpDir, "auto");
      const manualDir = path.join(tmpDir, "manual");

      const autoResult = await this.ytDlpClient.exec([
        url,
        "--write-auto-subs",
        "--sub-format",
        "json3",
        "--sub-langs",
        autoLang,
        "--skip-download",
        "-o",
        path.join(autoDir, "%(id)s"),
      ]);
      if (!autoResult.ok) return autoResult;

      const manualResult = await this.ytDlpClient.exec([
        url,
        "--write-subs",
        "--sub-format",
        "json3",
        "--sub-langs",
        manualLang,
        "--skip-download",
        "-o",
        path.join(manualDir, "%(id)s"),
      ]);
      if (!manualResult.ok) return manualResult;

      const autoFile = await this.findSubtitleFile(autoDir);
      const manualFile = await this.findSubtitleFile(manualDir);

      if (!autoFile) {
        return Failure({
          type: "YT_DLP_ERROR",
          message: "yt-dlp produced no auto subtitle file",
        });
      }
      if (!manualFile) {
        return Failure({
          type: "YT_DLP_ERROR",
          message: "yt-dlp produced no manual subtitle file",
        });
      }

      const autoTrack = JSON.parse(await readFile(autoFile, "utf-8"));
      const manualTrack = JSON.parse(await readFile(manualFile, "utf-8"));

      const storeAutoResult = await this.rawDataStore.storeRawCaptionTrack(
        videoId,
        "auto",
        fetchedAt,
        autoLang,
        autoTrack,
      );
      if (!storeAutoResult.ok) return storeAutoResult;

      const storeManualResult = await this.rawDataStore.storeRawCaptionTrack(
        videoId,
        "manual",
        fetchedAt,
        manualLang,
        manualTrack,
      );
      if (!storeManualResult.ok) return storeManualResult;

      const autoCaptions = this.parseCaptionTrack(autoTrack, "auto");
      if (!autoCaptions.ok) return autoCaptions;

      const manualCaptions = this.parseCaptionTrack(manualTrack, "manual");
      if (!manualCaptions.ok) return manualCaptions;

      return Success({
        autoCaptions: autoCaptions.value,
        manualCaptions: manualCaptions.value,
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async findSubtitleFile(dir: string): Promise<string | null> {
    try {
      const files = await readdir(dir);
      const json3File = files.find((f) => f.endsWith(".json3"));
      return json3File ? path.join(dir, json3File) : null;
    } catch {
      return null;
    }
  }

  private parseCaptionTrack(
    track: unknown,
    type: CaptionTrackKind,
  ): Result<Caption[], ValidationError> {
    const extractResult = captionsExtractor.extractFromJson({
      jsonResponse: track,
      type,
    });
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
