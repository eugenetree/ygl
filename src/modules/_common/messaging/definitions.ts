// Shared by the bot and every worker process, so this file imports nothing
// from feature modules.

import { z } from "zod";

import type { EventDefinition } from "./event-bus.js";
import { TASK_RUN_FAILED } from "./failed-runs.js";
import { runCompletedSchema } from "./runs.js";
import type { AnyTask } from "./task-queue.js";

const recalculatePrioritiesOutputSchema = z.object({
  total: z.number(),
  failed: z.number(),
});

export type RecalculatePrioritiesOutput = z.infer<
  typeof recalculatePrioritiesOutputSchema
>;

const reprocessCaptionsOutputSchema = z.object({
  processedCount: z.number(),
  failedCount: z.number(),
  bothValidBefore: z.number(),
  bothValidAfter: z.number(),
  becameValid: z.array(z.string()),
  becameInvalid: z.array(z.string()),
});

export type ReprocessCaptionsOutput = z.infer<
  typeof reprocessCaptionsOutputSchema
>;

const rebuildSearchIndexOutputSchema = z.object({
  indexed: z.number(),
  oldIndexSize: z.number().nullable(),
  newIndexSize: z.number(),
});

export type RebuildSearchIndexOutput = z.infer<
  typeof rebuildSearchIndexOutputSchema
>;

export const EVENTS = {
  RECALCULATE_PRIORITIES_RUN_COMPLETED: {
    name: "recalculate-priorities-run-completed",
    schema: runCompletedSchema(recalculatePrioritiesOutputSchema),
  },
  REPROCESS_CAPTIONS_RUN_COMPLETED: {
    name: "reprocess-captions-run-completed",
    schema: runCompletedSchema(reprocessCaptionsOutputSchema),
  },
  REBUILD_SEARCH_INDEX_RUN_COMPLETED: {
    name: "rebuild-search-index-run-completed",
    schema: runCompletedSchema(rebuildSearchIndexOutputSchema),
  },
  TASK_RUN_FAILED,
} satisfies Record<string, EventDefinition<unknown>>;

export const TASKS = {
  RECALCULATE_PRIORITIES: {
    name: "recalculate-priorities",
    expireInSeconds: 30 * 60,
    runCompleted: EVENTS.RECALCULATE_PRIORITIES_RUN_COMPLETED,
  },
  REPROCESS_CAPTIONS: {
    name: "reprocess-captions",
    expireInSeconds: 6 * 60 * 60,
    runCompleted: EVENTS.REPROCESS_CAPTIONS_RUN_COMPLETED,
  },
  REBUILD_SEARCH_INDEX: {
    name: "rebuild-search-index",
    expireInSeconds: 8 * 60 * 60,
    runCompleted: EVENTS.REBUILD_SEARCH_INDEX_RUN_COMPLETED,
  },
} satisfies Record<string, AnyTask>;
