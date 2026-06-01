import { injectable } from "inversify";

import { Failure, type Result, Success } from "../../types/index.js";
import type { FetchError } from "../_common/http/errors.js";
import type { HttpClient } from "../_common/http/index.js";
import type {
  ParsingError,
  ValidationError,
} from "../_common/validation/errors.js";
import { channelInfoExtractor } from "./extractors/channel-info.extractor.js";
import type { Channel } from "./youtube-api.types.js";

@injectable()
export class YoutubeApiGetChannel {
  constructor(private readonly httpClient: HttpClient) {}

  async getChannel(
    channelId: string,
  ): Promise<Result<Channel, FetchError | ParsingError | ValidationError>> {
    const url = encodeURI(`https://youtube.com/channel/${channelId}/about`);

    const responseResult = await this.httpClient.get(url);
    if (!responseResult.ok) {
      return Failure(responseResult.error);
    }

    const channelResult = channelInfoExtractor.extractFromHtml(
      responseResult.value,
    );

    if (!channelResult.ok) {
      return Failure(channelResult.error);
    }

    return Success(channelResult.value);
  }
}
