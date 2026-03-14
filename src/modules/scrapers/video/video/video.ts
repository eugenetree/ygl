import { z } from "zod";
import { validator } from "../../../_common/validation/validator.js";
import { ValidationError } from "../../../_common/validation/errors.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { LanguageCode as LanguageCodeEnum } from "../../../i18n/index.js";

export type AutoCaptionsStatus = z.infer<typeof autoCaptionsStatusSchema>;
export const autoCaptionsStatusSchema = z.enum([
  "CAPTIONS_ABSENT",
  "CAPTIONS_VALID",
  "CAPTIONS_EMPTY",
  "CAPTIONS_TOO_SHORT",
]);

export type ManualCaptionsStatus = z.infer<typeof manualCaptionsStatusSchema>;
export const manualCaptionsStatusSchema = z.enum([
  "CAPTIONS_ABSENT",
  "CAPTIONS_VALID",
  "CAPTIONS_PENDING_VALIDATION",
  "CAPTIONS_EMPTY",
  "CAPTIONS_TOO_SHORT",
  "CAPTIONS_MOSTLY_UPPERCASE",
  "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS",
]);

export type LanguageCode = z.infer<typeof languageCodeSchema>;
export const languageCodeSchema = z.nativeEnum(LanguageCodeEnum);

export type VideoProps = z.infer<typeof videoPropsSchema>;
export const videoPropsSchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  keywords: z.array(z.string()),
  viewCount: z.number(),
  thumbnail: z.string(),
  languageCode: languageCodeSchema.nullable(),
  autoCaptionsStatus: autoCaptionsStatusSchema,
  manualCaptionsStatus: manualCaptionsStatusSchema,
  captionsSimilarityScore: z.number().nullable(),
  asr: z.number().nullable(),
  abr: z.number().nullable(),
  acodec: z.string().nullable(),
  audioChannels: z.number().nullable(),
  audioQuality: z.string().nullable(),
  isDrc: z.boolean().nullable(),
  categories: z.array(z.string()),
  track: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  creator: z.string().nullable(),
  captionsShift: z.number().nullable(),
  channelId: z.string(),
  uploadedAt: z.coerce.date().nullable(),
  description: z.string().nullable(),
  likeCount: z.number().nullable(),
  commentCount: z.number().nullable(),
  availability: z.string().nullable(),
  playableInEmbed: z.boolean().nullable(),
  channelIsVerified: z.boolean().nullable(),
});

type CreateParams = Omit<VideoProps, "createdAt" | "updatedAt">;

export class Video {
  constructor(private props: VideoProps) { }

  static create(params: CreateParams): Result<Video, ValidationError> {
    const now = new Date();

    const result = validator.validate(videoPropsSchema, {
      ...params,
      createdAt: now,
      updatedAt: now,
    });

    if (!result.ok) {
      return Failure(result.error);
    }

    if (params.autoCaptionsStatus === "CAPTIONS_ABSENT" && params.languageCode !== null) {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "It's not expected to have language detected when no auto captions.",
        context: {
          videoId: params.id,
          languageCode: params.languageCode,
          autoCaptionsStatus: params.autoCaptionsStatus,
        }
      })
    }

    return Success(new Video(result.value));
  }

  get id() { return this.props.id; }
  get channelId() { return this.props.channelId; }
  get categories() { return this.props.categories; }
  get track() { return this.props.track; }
  get artist() { return this.props.artist; }
  get album() { return this.props.album; }

  _toPersistance(): VideoProps {
    return { ...this.props };
  }

  _fromPersistance(props: VideoProps): Video {
    return new Video(props);
  }
}
