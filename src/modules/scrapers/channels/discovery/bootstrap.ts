import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelDiscoveryWorker } from "./worker.js";
import { SearchChannelViaVideosQueriesSeeder } from "../search/search-channel-via-videos-queries.seeder.js";

const spawnWorker = ({
  name,
}: {
  name: string;
}) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: `${ChannelDiscoveryWorker.name}-${name}`,
      category: `worker-channels-discovery`,
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);

  const worker = container.get(ChannelDiscoveryWorker);
  worker.start();
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-channels-discovery",
    category: "worker-channels-discovery",
  })

  const seeder = new SearchChannelViaVideosQueriesSeeder(logger);
  const result = await seeder.seedIfNeeded();

  if (!result.ok) {
    logger.error({
      error: result.error,
    });
    process.exit(1);
  }

  spawnWorker({ name: "default" });
}

bootstrap();