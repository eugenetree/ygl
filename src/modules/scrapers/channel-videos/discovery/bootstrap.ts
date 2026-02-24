import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelVideosDiscoveryWorker } from "./worker.js";

const spawnWorker = ({
  name,
}: {
  name: string;
}) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: `${ChannelVideosDiscoveryWorker.name}-${name}`,
      category: `worker-channel-videos-discovery`,
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);

  const worker = container.get(ChannelVideosDiscoveryWorker);
  worker.start();
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-channel-videos-discovery",
    category: "worker-channel-videos-discovery",
  });

  logger.info("Starting channel videos discovery worker...");
  spawnWorker({ name: "default" });
}

bootstrap();
