import { injectable } from "inversify";
import {
  ActualStatus,
  InstanceRegistry,
  RequestedStatus,
  Status,
} from "../instance-registry/instance-registry.js";

export type { Status };

@injectable()
export class ScraperStatusService {
  private readonly instanceId: string;

  constructor(private readonly instanceRegistry: InstanceRegistry) {
    this.instanceId = process.env.SCRAPER_INSTANCE_ID ?? "";
  }

  updateStatus(update: { actual?: ActualStatus; requested?: RequestedStatus }) {
    return this.instanceRegistry.updateStatus(this.instanceId, update);
  }

  getActualStatus() {
    return this.instanceRegistry.getActualStatus(this.instanceId);
  }

  getRequestedStatus() {
    return this.instanceRegistry.getRequestedStatus(this.instanceId);
  }
}
