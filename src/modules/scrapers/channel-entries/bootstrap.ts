import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../_common/http/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelFetcherWorker } from "./worker.js";

const spawnWorker = ({
  name,
}: {
  name: string;
}) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: `${ChannelFetcherWorker.name}-${name}`,
      category: `worker-channel-fetcher`,
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);

  const worker = container.get(ChannelFetcherWorker);
  worker.start();
};

export async function bootstrap() {
  spawnWorker({ name: "default" });
}

bootstrap();
