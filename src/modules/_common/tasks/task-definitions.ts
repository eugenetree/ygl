// Shared by the bot and every worker process, so this file imports nothing
// from feature modules.

export type Task<Data extends object, Output> = {
  readonly name: string;
  readonly expireInSeconds: number;
  readonly heartbeatSeconds: number;
  // Never set: they carry the payload and output types to `request` and `work`.
  readonly _data?: Data;
  readonly _output?: Output;
};

export type AnyTask = Task<object, unknown>;

const DEFAULT_HEARTBEAT_SECONDS = 60;

export function defineTask<Data extends object, Output>(definition: {
  name: string;
  expireInSeconds: number;
  heartbeatSeconds?: number;
}): Task<Data, Output> {
  return {
    heartbeatSeconds: DEFAULT_HEARTBEAT_SECONDS,
    ...definition,
  };
}

export type RecalculatePrioritiesOutput = {
  total: number;
  failed: number;
};

export const recalculatePriorities = defineTask<
  Record<string, never>,
  RecalculatePrioritiesOutput
>({
  name: "recalculate-priorities",
  expireInSeconds: 30 * 60,
});

export type RebuildSearchIndexOutput = {
  indexed: number;
  oldIndexSize: number | null;
  newIndexSize: number;
};

export const rebuildSearchIndex = defineTask<
  Record<string, never>,
  RebuildSearchIndexOutput
>({
  name: "rebuild-search-index",
  expireInSeconds: 8 * 60 * 60,
});

export const TASKS: readonly AnyTask[] = [
  recalculatePriorities,
  rebuildSearchIndex,
];
