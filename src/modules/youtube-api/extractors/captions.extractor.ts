import { z } from "zod";

import { Failure, type Result, Success } from "../../../types/index.js";
import { ValidationError } from "../../_common/validation/errors.js";

type GetCaptionsParams = {
  jsonResponse: unknown;
  type: "manual" | "auto";
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
  // Optional: manual tracks uploaded with broken subtitles may omit dDurationMs entirely; those
  // events are classified downstream as CAPTIONS_MISSING_DURATIONS. Keeping this strict would
  // silently drop all events, making a broken track indistinguishable from a genuinely empty one.
  dDurationMs: z.number().optional().default(0),
  segs: z.array(
    z.object({
      utf8: z.string().refine((value) => value !== "\n"),
      tOffsetMs: z.number().optional(), // optional as youtube returs no field for 0 offset
    }),
  ),
});

function lastWordEnd({
  wordStart,
  lineEnd,
  nextLineStart,
}: {
  wordStart: number;
  lineEnd: number;
  nextLineStart: number | undefined;
}): number {
  const nextLineStartsLater =
    nextLineStart !== undefined && nextLineStart > wordStart;
  const end = nextLineStartsLater ? Math.min(nextLineStart, lineEnd) : lineEnd;
  if (end >= wordStart) return end;

  // YouTube sometimes places a line's last word after the line's own end.
  return nextLineStartsLater ? nextLineStart : wordStart;
}

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

    const lines = jsonParseResult.data.events.flatMap((event) => {
      const eventParseResult = eventSchema.safeParse(event);
      return eventParseResult.success ? [eventParseResult.data] : [];
    });

    for (const [lineIndex, line] of lines.entries()) {
      const { tStartMs, dDurationMs, segs } = line;

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

      // Auto tracks group words into on-screen lines and give each word only an
      // offset from its line's start, so a word ends where a later word starts.
      // Words that share an offset (block-level tracks give none) say nothing
      // about each other's end. A line's duration is how long it stays on
      // screen, which often runs past the next line's start, so a word with no
      // later word in its line ends at whichever comes first.
      const lineEnd = tStartMs + dDurationMs;
      const nextLineStart = lines[lineIndex + 1]?.tStartMs;

      for (let i = 0; i < segs.length; i++) {
        const currentSeg = segs[i];
        const offset = currentSeg.tOffsetMs ?? 0;
        const laterSeg = segs
          .slice(i + 1)
          .find((seg) => (seg.tOffsetMs ?? 0) > offset);

        const wordStart = tStartMs + offset;
        const startTime = Math.round(wordStart);
        const endTime = Math.round(
          laterSeg
            ? tStartMs + (laterSeg.tOffsetMs ?? 0)
            : lastWordEnd({ wordStart, lineEnd, nextLineStart }),
        );

        const caption: Caption = {
          startTime,
          endTime,
          duration: endTime - startTime,
          textSegments: [
            {
              utf8: currentSeg.utf8,
              offsetTime: currentSeg.tOffsetMs
                ? Math.round(currentSeg.tOffsetMs)
                : 0,
            },
          ],
        };

        resultCaptions.push(caption);
      }
    }

    return Success(resultCaptions);
  }
}

export const captionsExtractor = new CaptionsExtractor();
