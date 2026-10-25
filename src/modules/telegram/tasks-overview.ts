import type { LatestRun } from "../_common/tasks/tasks.js";

export type TaskOverview = {
  task: string;
  latestRun: LatestRun | undefined;
  progress?: string;
};

export function formatTasksOverview(
  overviews: readonly TaskOverview[],
  now: Date,
): string {
  return overviews
    .map((overview) => formatTaskOverview(overview, now))
    .join("\n\n");
}

function formatTaskOverview(
  { task, latestRun, progress }: TaskOverview,
  now: Date,
) {
  if (!latestRun) {
    return `${task}: no runs in the last 7 days`;
  }
  const lines = [
    `${task}: ${formatState(latestRun, now)}`,
    `Requested ${formatTime(latestRun.requestedAt)}`,
  ];
  if (progress && latestRun.state === "running") {
    lines.push(progress);
  }
  return lines.join("\n");
}

function formatState(run: LatestRun, now: Date): string {
  const ranFor =
    run.startedAt &&
    formatDuration((run.endedAt ?? now).getTime() - run.startedAt.getTime());

  switch (run.state) {
    case "queued":
      return "queued";
    case "running":
      return `running for ${ranFor}`;
    case "completed":
      return `completed in ${ranFor}`;
    case "failed":
      return ranFor ? `failed after ${ranFor}` : "failed";
  }
}

function formatTime(time: Date): string {
  return `${time.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
