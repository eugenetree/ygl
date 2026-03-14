import { z } from "zod";
import { validator } from "../../../_common/validation/validator.js";
import { ValidationError } from "../../../_common/validation/errors.js";
import { Failure, Result, Success } from "../../../../types/index.js";

export type CaptionType = z.infer<typeof captionTypeSchema>;
export const captionTypeSchema = z.enum(["auto", "manual"]);

export type CaptionProps = z.infer<typeof captionPropsSchema>;
export const captionPropsSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),
  text: z.string(),
  type: captionTypeSchema,
  videoId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

type CreateParams = Omit<CaptionProps, "id" | "createdAt" | "updatedAt">;

export class Caption {
  constructor(private props: CaptionProps) { }

  static create(params: CreateParams): Result<Caption, ValidationError> {
    const now = new Date();

    const result = validator.validate(captionPropsSchema, {
      ...params,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });

    if (!result.ok) {
      return Failure(result.error);
    }

    if (params.startTime > params.endTime) {
      return Failure({
        type: "VALIDATION_ERROR",
        message: "Caption start time must be before end time.",
        context: {
          videoId: params.videoId,
          startTime: params.startTime,
          endTime: params.endTime,
        },
      });
    }

    return Success(new Caption(result.value));
  }

  get id() { return this.props.id; }
  get startTime() { return this.props.startTime; }
  get endTime() { return this.props.endTime; }
  get duration() { return this.props.duration; }
  get text() { return this.props.text; }
  get type() { return this.props.type; }
  get videoId() { return this.props.videoId; }

  _toPersistance(): CaptionProps {
    return { ...this.props };
  }

  _fromPersistance(props: CaptionProps): Caption {
    return new Caption(props);
  }
}
