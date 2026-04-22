import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";
import { CaptionsService } from "./captions.service.js";

@injectable()
export class FindCaptionsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly captionsService: CaptionsService,
  ) {
    this.logger.setContext(FindCaptionsUseCase.name);
  }

  async execute(query: string) {
    const hits = await this.captionsService.search(query);
    this.logger.info(`Found ${hits.length} captions for query: ${query}`);
    return hits;
  }
}
