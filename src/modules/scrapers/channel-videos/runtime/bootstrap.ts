import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
// rely on autobind for services/use-cases/repositories
import { ChannelVideosRuntimeWorker } from "./worker.js";

const spawnWorker = ({
  name,
  proxy,
}: {
  name: string;
  proxy?: {
    host: string;
    port: number;
    protocol: string;
  };
}) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    const logger = new Logger({
      context: `${ChannelVideosRuntimeWorker.name}-${name}`,
      category: `worker-channel-videos`,
    });

    return logger;
  });

  container.bind(HttpClient).toDynamicValue((context) => {
    const logger = context.get(Logger);

    return httpClient;

    return new HttpClient(logger, {
      requestCooldown: 5000,
      proxy,
    });
  });

  const worker = container.get(ChannelVideosRuntimeWorker);
  worker.start();
};

export function bootstrap() {
  spawnWorker({ name: "default" });
}

bootstrap();
