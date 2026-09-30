import { injectable } from "inversify";
import { Logger } from "../_common/logger/logger.js";
import { CaptionsService } from "./captions.service.js";

@injectable()
export class FindCaptionsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly captionsService: CaptionsService,
  ) {
    this.logger.setContext(FindCaptionsUseCase.name);
  }

  async execute(query: string, page: { offset: number; limit: number }) {
    const result = await this.captionsService.search(query, page);
    if (result.ok) {
      this.logger.info(
        `Found ${result.value.total}${result.value.isTotalExact ? "" : "+"} clips for query: ${query}`,
      );
    }
    return result;
  }
}
