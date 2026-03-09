import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../../_common/http/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { VideoEntriesWorker } from "./video-entries.worker.js";

export const spawnWorker = async ({ name, shouldContinue }: { name: string, shouldContinue?: () => boolean }) => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: `${VideoEntriesWorker.name}-${name}`,
      category: `worker-video-fetcher`,
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);

  const worker = container.get(VideoEntriesWorker);
  await worker.start(shouldContinue);
};

export async function bootstrap() {
  spawnWorker({ name: "default" });
}

// bootstrap();
