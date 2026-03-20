export const SCRAPER_NAME = {
  CHANNEL_DISCOVERY: "CHANNEL_DISCOVERY",
  CHANNEL: "CHANNEL",
  VIDEO_DISCOVERY: "VIDEO_DISCOVERY",
  VIDEO: "VIDEO",
} as const;

export type ScraperName = (typeof SCRAPER_NAME)[keyof typeof SCRAPER_NAME];

export const WORKER_STOP_CAUSE = {
  EMPTY: "EMPTY",
  DONE: "DONE",
  STOPPED: "STOPPED",
} as const;

export type WorkerStopCause = (typeof WORKER_STOP_CAUSE)[keyof typeof WORKER_STOP_CAUSE];