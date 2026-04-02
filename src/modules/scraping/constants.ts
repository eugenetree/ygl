export const ScraperName = {
  CHANNEL_DISCOVERY: "CHANNEL_DISCOVERY",
  CHANNEL: "CHANNEL",
  VIDEO_DISCOVERY: "VIDEO_DISCOVERY",
  VIDEO: "VIDEO",
} as const;

export type ScraperName = (typeof ScraperName)[keyof typeof ScraperName];

export const WorkerStopCause = {
  EMPTY: "EMPTY",
  DONE: "DONE",
  STOPPED: "STOPPED",
} as const;

export type WorkerStopCause = (typeof WorkerStopCause)[keyof typeof WorkerStopCause];