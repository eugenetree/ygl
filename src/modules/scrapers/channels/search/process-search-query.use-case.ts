import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelSearchService } from "./channel-search.service.js";
import { SearchChannelQuery } from "../../../domain/search-channel-query.js";
import { FetchError } from "../../../_common/http/errors.js";
import { ParsingError } from "../../../_common/validation/errors.js";
import { ValidationError } from "../../../_common/validation/errors.js";

@injectable()
export class ProcessSearchQueryUseCase {
  constructor(
    private readonly channelSearchService: ChannelSearchService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext(ProcessSearchQueryUseCase.name);
  }

  async execute(query: SearchChannelQuery): Promise<Result<null, FetchError | ParsingError | ValidationError>> {
    const processResult = await this.channelSearchService.searchAndPersistByQuery(query.query);

    if (!processResult.ok) {
      return Failure(processResult.error);
    }

    return Success(null);
  }
}



