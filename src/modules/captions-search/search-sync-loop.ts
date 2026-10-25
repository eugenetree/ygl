import { injectable, unmanaged } from "inversify";
import { Logger } from "../_common/logger/logger.js";
import { SyncDataToElasticUseCase } from "./sync-data-to-elastic.use-case.js";

export type SearchSyncLoopOptions = { intervalMs: number };

/**
 * Runs an incremental sync pass every interval, and other work that writes the
 * search index between passes, so nothing writes it at the same time as a pass.
 */
@injectable()
export class SearchSyncLoop {
  private readonly queued: (() => Promise<void>)[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;

  constructor(
    private readonly syncUseCase: SyncDataToElasticUseCase,
    private readonly logger: Logger,
    @unmanaged()
    private readonly options: SearchSyncLoopOptions = { intervalMs: 60_000 },
  ) {
    this.logger.setContext(SearchSyncLoop.name);
  }

  start(): void {
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timeout) clearTimeout(this.timeout);
  }

  /** Runs `work` once no pass is running, and passes resume after it ends. */
  runBetweenPasses<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queued.push(() => work().then(resolve, reject));
      if (!this.busy && !this.stopped) {
        if (this.timeout) clearTimeout(this.timeout);
        void this.tick();
      }
    });
  }

  private async tick(): Promise<void> {
    this.timeout = null;
    this.busy = true;
    do {
      for (let work = this.queued.shift(); work; work = this.queued.shift()) {
        await work();
      }
      await this.runPass();
    } while (this.queued.length > 0 && !this.stopped);
    this.busy = false;

    if (!this.stopped) {
      this.timeout = setTimeout(() => this.tick(), this.options.intervalMs);
    }
  }

  private async runPass(): Promise<void> {
    try {
      const result = await this.syncUseCase.execute();
      if (result.ok) {
        this.logger.info(`Sync done: ${result.value.synced} captions synced`);
      }
    } catch (error) {
      this.logger.error({ message: "Sync failed", error });
    }
  }
}
