import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelsDirectWorker } from "./worker-direct.js";
import { SearchChannelDirectQueriesSeeder } from "../search/search-channel-direct-queries.seeder.js";

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
      context: `${SearchChannelsDirectWorker.name}-${name}`,
      category: `worker-channels-direct`,
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

  const worker = container.get(SearchChannelsDirectWorker);
  worker.start();
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-direct",
    category: "worker-channels-direct"
  });

  logger.info("Starting direct query seeding process...");

  const seeder = new SearchChannelDirectQueriesSeeder(logger);
  const result = await seeder.seedIfNeeded();

  if (!result.ok) {
    logger.error({
      message: "Failed to seed direct queries",
      error: result.error
    });
    process.exit(1);
  }

  logger.info("Direct query seeding completed successfully");

  spawnWorker({ name: "default" });
}

bootstrap();
