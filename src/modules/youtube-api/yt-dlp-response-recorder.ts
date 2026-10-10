import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { injectable } from "inversify";
import { Logger } from "../_common/logger/logger.js";

const gzipAsync = promisify(gzip);

const RETENTION_DAYS = 14;
const DAY_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keeps what yt-dlp returned for each video fetch, so recent fetches can be
 * inspected without fetching them again. One gzipped JSON line per fetch at
 * `$YTDLP_RAW_DIR/<YYYY-MM-DD>/<HHMMSS>_<videoId>.json.gz` (UTC), day
 * directories older than RETENTION_DAYS removed. Off when YTDLP_RAW_DIR is unset.
 */
@injectable()
export class YtDlpResponseRecorder {
  private readonly dir: string | undefined;
  private lastPrunedDay: string | undefined;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(YtDlpResponseRecorder.name);
    this.dir = process.env.YTDLP_RAW_DIR || undefined;
  }

  /** Never rejects: a lost record must not fail the fetch it describes. */
  public async record(videoId: string, result: unknown): Promise<void> {
    const dir = this.dir;
    if (!dir) return;

    const fetchedAt = new Date().toISOString();
    const day = fetchedAt.slice(0, 10);
    const time = fetchedAt.slice(11, 19).replaceAll(":", "");

    try {
      const dayDir = path.join(dir, day);
      await fs.mkdir(dayDir, { recursive: true });
      const body = await gzipAsync(
        JSON.stringify({ videoId, fetchedAt, result }) + "\n",
      );
      await fs.writeFile(path.join(dayDir, `${time}_${videoId}.json.gz`), body);

      await this.pruneOnceADay(dir, day);
    } catch (error) {
      this.logger.warn(
        `Failed to record yt-dlp response for video ${videoId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async pruneOnceADay(dir: string, today: string): Promise<void> {
    if (this.lastPrunedDay === today) return;
    this.lastPrunedDay = today;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    for (const name of await fs.readdir(dir)) {
      if (DAY_DIR_PATTERN.test(name) && name < cutoff) {
        await fs.rm(path.join(dir, name), { recursive: true, force: true });
      }
    }
  }
}
