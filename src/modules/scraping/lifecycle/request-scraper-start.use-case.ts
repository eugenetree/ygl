import { injectable } from "inversify";
import { Failure } from "../../../types/index.js";
import { InstanceRegistry } from "../instance-registry/instance-registry.js";

@injectable()
export class RequestScraperStartUseCase {
  constructor(private readonly instanceRegistry: InstanceRegistry) {}

  async execute(instanceId: string) {
    const currentStatusResult =
      await this.instanceRegistry.getActualStatus(instanceId);
    if (!currentStatusResult.ok) {
      return currentStatusResult;
    }

    const currentStatus = currentStatusResult.value;
    if (currentStatus === "RUNNING") {
      return Failure({ type: "SCRAPER_ALREADY_RUNNING" } as const);
    }

    if (currentStatus === "KILLED") {
      return Failure({ type: "SCRAPER_KILLED" } as const);
    }

    return this.instanceRegistry.updateStatus(instanceId, {
      requested: "RUNNING",
    });
  }
}
