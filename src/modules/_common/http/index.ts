import { injectable } from "inversify";
import axios, { AxiosInstance, isAxiosError } from "axios";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../logger/logger.js";
import { FetchError } from "./errors.js";

type ConfigInput = {
  requestCooldown?: number;
  proxy?: {
    host: string;
    port: number;
    protocol: string;
  };
};

type Config = {
  requestCooldown: number;
  proxy?: {
    host: string;
    port: number;
    protocol: string;
  };
};

const globalState: {
  lastRequestEndTime: number;
  queue: Promise<unknown>;
} = {
  lastRequestEndTime: 0,
  queue: Promise.resolve(),
};

/**
 * Current implementation of the HttpClient is more like a request queue.
 * It waits for the request cooldown to pass before making a new request.
 * Parallel requests are not supported.
 */

@injectable()
export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly config: Config;

  constructor(
    private readonly logger: Logger,
    config: ConfigInput,
  ) {
    this.config = {
      requestCooldown: 0,
      ...config,
    };

    this.client = axios.create({
      proxy: this.config.proxy,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
  }

  private request<T>(requestFn: () => Promise<T>): Promise<T> {
    if (!this.config.requestCooldown) {
      return requestFn();
    }

    const requestPromise = globalState.queue.then(async () => {
      const now = Date.now();

      const timeSinceLastRequest = now - globalState.lastRequestEndTime;
      const remainingCooldown =
        timeSinceLastRequest > this.config.requestCooldown
          ? 0
          : this.config.requestCooldown - timeSinceLastRequest;

      this.logger.info(
        `lastRequestEndTime: ${globalState.lastRequestEndTime}, remainingCooldown: ${remainingCooldown}`,
      );

      if (globalState.lastRequestEndTime !== 0 && remainingCooldown > 0) {
        await this.sleep(remainingCooldown);
      }

      const result = await requestFn();
      globalState.lastRequestEndTime = Date.now();
      return result;
    });

    globalState.queue = requestPromise;

    return requestPromise;
  }

  async get(url: string): Promise<Result<unknown, FetchError>> {
    return this.request(async () => {
      this.logger.info(`GET to ${url}`);

      try {
        const response = await this.client.get<unknown>(url);
        return Success(response.data);
      } catch (error) {
        return Failure(this.handleError(error));
      }
    });
  }

  async post(
    url: string,
    {
      body,
      headers,
    }: {
      body: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<Result<unknown, FetchError>> {
    return this.request(async () => {
      this.logger.info(`POST to ${url}`);

      try {
        const response = await this.client.post<unknown>(url, body, {
          headers,
        });
        return Success(response.data);
      } catch (error) {
        return Failure(this.handleError(error));
      }
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private handleError(error: unknown): FetchError {
    if (!isAxiosError(error)) {
      return {
        type: "FETCH_ERROR",
        kind: "UNKNOWN",
        cause: error,
      };
    }

    if (error.response) {
      const { status, statusText, data } = error.response;

      return {
        type: "FETCH_ERROR",
        kind: "HTTP",
        status,
        statusText,
        data,
      };
    }

    if (error.request) {
      return {
        type: "FETCH_ERROR",
        kind: "NETWORK",
        cause: error,
      };
    }

    return {
      type: "FETCH_ERROR",
      kind: "UNKNOWN",
      cause: error,
    };
  }
}

// TODO: remove singleton
export const httpClient = new HttpClient(
  new Logger({
    context: "http-client",
  }),
  {
    requestCooldown: 5000
  },
);
