import { z } from "zod";

import { Failure, Result, Success } from "../../../types/index.js";
import { ValidationError } from "../../_common/validation/errors.js";

type GetCaptionsParams = {
  jsonResponse: unknown;
  type: "manual" | "auto"
};

type Caption = {
  startTime: number;
  endTime: number;
  duration: number;
  textSegments: { utf8: string; offsetTime: number }[];
};

const jsonSchema = z.object({
  events: z.array(z.unknown()),
});

const eventSchema = z.object({
  tStartMs: z.number(),
  dDurationMs: z.number(),
  segs: z.array(
    z.object({
      utf8: z.string().refine((value) => value !== "\n"),
      tOffsetMs: z.number().optional(), // optional as youtube returs no field for 0 offset
    }),
  ),
});

class CaptionsExtractor {
  extractFromJson({
    jsonResponse,
    type,
  }: GetCaptionsParams): Result<Caption[], ValidationError> {
    const resultCaptions: Caption[] = [];

    const jsonParseResult = jsonSchema.safeParse(jsonResponse);
    if (!jsonParseResult.success) {
      return Failure({
        type: "VALIDATION_ERROR",
        cause: jsonParseResult.error,
      });
    }

    for (const event of jsonParseResult.data.events) {
      const eventParseResult = eventSchema.safeParse(event);

      if (!eventParseResult.success) {
        continue;
      }

      const { tStartMs, dDurationMs, segs } = eventParseResult.data;

      if (type === "manual") {
        const caption: Caption = {
          startTime: Math.round(tStartMs),
          endTime: Math.round(tStartMs + dDurationMs),
          duration: Math.round(dDurationMs),
          textSegments: segs.map((seg) => ({
            utf8: seg.utf8,
            offsetTime: seg.tOffsetMs ? Math.round(seg.tOffsetMs) : 0,
          })),
        };

        resultCaptions.push(caption);
        continue;
      }

      for (let i = 0; i < segs.length; i++) {
        const currentSeg = segs[i];
        const nextSeg = segs[i + 1];

        const startTime = Math.round(tStartMs + (currentSeg?.tOffsetMs ?? 0));
        const endTime = Math.round(tStartMs + (nextSeg?.tOffsetMs ?? (tStartMs + dDurationMs)));

        const caption: Caption = {
          startTime,
          endTime,
          duration: endTime - startTime,
          textSegments: [
            {
              utf8: currentSeg.utf8,
              offsetTime: currentSeg.tOffsetMs ? Math.round(currentSeg.tOffsetMs) : 0,
            },
          ],
        }

        resultCaptions.push(caption);
      }
    }

    return Success(resultCaptions);
  }
}

export const captionsExtractor = new CaptionsExtractor();
