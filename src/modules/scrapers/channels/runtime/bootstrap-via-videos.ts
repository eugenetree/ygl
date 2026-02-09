import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelsViaVideosWorker } from "./worker-via-videos.js";
import { SearchChannelViaVideosQueriesSeeder } from "../search/search-channel-via-videos-queries.seeder.js";

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
      context: `${SearchChannelsViaVideosWorker.name}-${name}`,
      category: `worker-channels-via-videos`,
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

  const worker = container.get(SearchChannelsViaVideosWorker);
  worker.start();
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-via-videos",
    category: "worker-channels-via-videos"
  });

  logger.info("Starting via-videos query seeding process...");

  const seeder = new SearchChannelViaVideosQueriesSeeder(logger);
  const result = await seeder.seedIfNeeded();

  if (!result.ok) {
    logger.error({
      message: "Failed to seed via-videos queries",
      error: result.error
    });
    process.exit(1);
  }

  logger.info("Via-videos query seeding completed successfully");

  spawnWorker({ name: "default" });
}

bootstrap();
