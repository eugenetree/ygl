import { z } from "zod";

export type RunId = string;

const runErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("HANDLER_FAILED"), message: z.string() }),
  z.object({ type: z.literal("WORKER_STOPPED_RESPONDING") }),
  z.object({ type: z.literal("TIMED_OUT") }),
  z.object({ type: z.literal("WORKER_SHUT_DOWN") }),
]);

export type RunError = z.infer<typeof runErrorSchema>;

// Events arrive as JSON, so their dates arrive as strings.
const endedRunSchema = z.object({
  task: z.string(),
  runId: z.string(),
  requestedAt: z.coerce.date(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
});

export type EndedRun = z.infer<typeof endedRunSchema>;

export type RunCompleted<Output> = EndedRun & { output: Output };

export function runCompletedSchema<Output>(
  output: z.ZodType<Output, z.ZodTypeDef, unknown>,
) {
  // zod can't infer an object type from a generic field.
  return endedRunSchema.extend({ output }) as z.ZodType<
    RunCompleted<Output>,
    z.ZodTypeDef,
    unknown
  >;
}

export const runFailedSchema = endedRunSchema.extend({ error: runErrorSchema });

export type RunFailed = z.infer<typeof runFailedSchema>;
