import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../../_common/http/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQueriesWorker } from "./search-channel-queries.worker.js";
import { SearchChannelQueriesSeeder } from "./search-channel-queries.seeder.js";
import { DatabaseClient } from "../../../../db/client.js";

const spawnWorker = async ({
  name,
  shouldContinue,
}: {
  name: string;
  shouldContinue?: () => boolean;
}) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: `${SearchChannelQueriesWorker.name}-${name}`,
      category: `worker-channels-discovery`,
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(DatabaseClient).toSelf().inSingletonScope();

  const worker = container.get(SearchChannelQueriesWorker);
  await worker.run({ shouldContinue: shouldContinue ?? (() => true), onError: async () => { } });
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-channels-discovery",
    category: "worker-channels-discovery",
  })

  const seeder = new SearchChannelQueriesSeeder(logger, new DatabaseClient());
  const result = await seeder.seedIfNeeded();

  if (!result.ok) {
    logger.error({
      error: result.error,
    });
    process.exit(1);
  }

  spawnWorker({ name: "default" });
}

// bootstrap();