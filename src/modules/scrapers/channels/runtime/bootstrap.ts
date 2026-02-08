import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelsWorker } from "./worker.js";
import { SearchChannelQueriesSeeder } from "../search/search-channel-queries.seeder.js";

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

export async function bootstrap() {
  const logger = new Logger({ 
    context: "bootstrap",
    category: "worker-channels" 
  });
  
  logger.info("Starting query seeding process...");
  
  const seeder = new SearchChannelQueriesSeeder(logger);
  const result = await seeder.seedIfNeeded();
  
  if (!result.ok) {
    logger.error({ 
      message: "Failed to seed queries",
      error: result.error 
    });
    process.exit(1);
  }
  
  logger.info("Query seeding completed successfully");
  
  spawnWorker({ name: "default" });
}

bootstrap();
