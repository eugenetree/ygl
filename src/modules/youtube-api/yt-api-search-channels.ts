import { injectable } from "inversify";
import { Failure, Result, Success } from "../../types/index.js";
import { FetchError } from "../_common/http/errors.js";
import { HttpClient } from "../_common/http/index.js";
import { Logger } from "../_common/logger/logger.js";
import { ParsingError } from "../_common/validation/errors.js";
import { ValidationError } from "../_common/validation/errors.js";
import { searchChannelsExtractor } from "./extractors/search-channels.extractor.js";

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

@injectable()
export class YoutubeApiSearchChannels {
  constructor(
    private readonly logger: Logger,
    private readonly httpClient: HttpClient,
  ) {
    this.logger.setContext(YoutubeApiSearchChannels.name);
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
    this.logger.info(`Searching for channels: ${query}`);

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
      `https://www.youtube.com/results?search_query=${query}&sp=EgIQAg==`,
    );

    const responseResult = await this.httpClient.get(url);
    if (!responseResult.ok) {
      return Failure(responseResult.error);
    }

    const channelsResult = searchChannelsExtractor.extractFromHtml(
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
      body: {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240906.01.00",
          },
        },
        continuation: token,
      },
    });

    if (!responseResult.ok) {
      this.logger.error({
        message: "Error searching for more channels",
        error: responseResult.error,
        context: { token },
      });

      return Failure(responseResult.error);
    }

    const jsonResult = searchChannelsExtractor.extractFromJson(
      responseResult.value,
    );

    if (!jsonResult.ok) {
      this.logger.error({
        message: "Error searching for more channels",
        error: jsonResult.error,
        context: { token },
      });

      return Failure(jsonResult.error);
    }

    return Success(jsonResult.value);
  }
}