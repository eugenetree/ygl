import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelsWorker } from "./worker.js";

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
      context: `${SearchChannelsWorker.name}-${name}`,
      category: `worker-channels`,
    });

    return logger;
  });

  container.bind(HttpClient).toDynamicValue((context) => {
    const logger = context.get(Logger);

    return httpClient;

    return new HttpClient(logger, {
      requestCooldown: 2000,
      proxy,
    });
  });

  const worker = container.get(SearchChannelsWorker);
  worker.start();
};

export function bootstrap() {
  spawnWorker({ name: "default" });
}

// bootstrap();
