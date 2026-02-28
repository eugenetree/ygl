import { injectable } from "inversify";
import { Failure, Result, Success } from "../../types/index.js";
import { FetchError } from "../_common/http/errors.js";
import { HttpClient } from "../_common/http/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError } from "../_common/validation/errors.js";
import { ValidationError } from "../_common/validation/errors.js";
import { searchChannelsViaVideosExtractor } from "./extractors/search-channels-via-videos.extractor.js";

export type SearchChannelEntry = {
  id: string;
  name: string;
  subscriberCount?: number;
};

type SearchChannelsResultSuccess =
  | {
    status: "found";
    query: string;
    chunk: SearchChannelEntry[];
  }
  | {
    status: "done";
    query: string;
  };

/**
 * This is not used anymore after migration to yt-dlp.
 */
@injectable()
export class YoutubeApiSearchChannelsViaVideosOld {
  constructor(
    private readonly logger: Logger,
    private readonly httpClient: HttpClient,
  ) {
    this.logger.setContext(YoutubeApiSearchChannelsViaVideosOld.name);
  }

  public async *searchChannels({
    query,
  }: {
    query: string;
  }): AsyncGenerator<
    Result<
      SearchChannelsResultSuccess,
      FetchError | ParsingError | ValidationError
    >,
    void,
    undefined
  > {
    this.logger.info(`Searching for channels via videos: ${query}`);

    const initialResult = await this.searchChannelsInitial(query);
    if (!initialResult.ok) {
      this.logger.error({
        message: "Error searching for channels",
        error: initialResult.error,
        context: { query },
      });

      yield Failure(initialResult.error);

      return;
    }

    const channels = initialResult.value.channels;
    if (!channels.length) {
      this.logger.info(
        `No channels found for query: ${query} from initial search`,
      );

      yield Success({
        status: "done",
        query,
      });

      return;
    }

    let token = initialResult.value.token;

    this.logger.info(
      `Found ${channels.length} channels for query: ${query} from initial search`,
    );

    yield Success({
      status: "found",
      query,
      chunk: channels,
    });

    while (token) {
      this.logger.info(`Searching for more channels for query: ${query}.`);

      const continuationResult = await this.searchChannelsContinuation(token);
      if (!continuationResult.ok) {
        yield Failure(continuationResult.error);
        return;
      }

      const channels = continuationResult.value.channels;
      if (!channels.length) {
        this.logger.info(
          `No channels found for query: ${query} from continuation search`,
        );

        yield Success({
          status: "done",
          query,
        });

        return;
      }

      this.logger.info(
        `Found ${channels.length} channels for query: ${query} from continuation`,
      );

      yield Success({
        status: "found",
        query,
        chunk: channels,
      });

      token = continuationResult.value.token;
    }
  }

  private async searchChannelsInitial(query: string) {
    const url = encodeURI(
      `https://www.youtube.com/results?search_query=${query}&sp=EgQQASgB`
    );

    const responseResult = await this.httpClient.get(url);
    if (!responseResult.ok) {
      return Failure(responseResult.error);
    }

    const channelsResult = searchChannelsViaVideosExtractor.extractFromHtml(
      responseResult.value,
    );

    if (!channelsResult.ok) {
      return Failure(channelsResult.error);
    }

    return Success(channelsResult.value);
  }

  private async searchChannelsContinuation(token: string) {
    const url = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";

    const responseResult = await this.httpClient.post(url, {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240906.01.00",
          },
        },
        continuation: token,
      }),
    });

    if (!responseResult.ok) {
      this.logger.error({
        message: "Error searching for channels",
        error: responseResult.error,
        context: { token },
      });

      return Failure(responseResult.error);
    }

    const channelsResult = searchChannelsViaVideosExtractor.extractFromJson(
      responseResult.value,
    );

    if (!channelsResult.ok) {
      this.logger.error({
        message: "Error searching for channels",
        error: channelsResult.error,
        context: { token },
      });

      return Failure(channelsResult.error);
    }

    return Success(channelsResult.value);
  }
}
