import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "../../../_common/logger/logger.js";
import { YtDlpClient } from "../../../youtube-api/yt-dlp-client.js";
import { ChannelsWorker } from "./channels.worker.js";

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
      context: `${ChannelsWorker.name}-${name}`,
      category: `worker-channel-videos-discovery`,
    });
  });

  container.bind(YtDlpClient).toSelf().inSingletonScope();

  const worker = container.get(ChannelsWorker);
  await worker.run({ shouldContinue: shouldContinue ?? (() => true), onError: async () => {} });
};

export async function bootstrap() {
  const logger = new Logger({
    context: "bootstrap-channel-videos-discovery",
    category: "worker-channel-videos-discovery",
  });

  logger.info("Starting channel videos discovery worker...");
  spawnWorker({ name: "default" });
}

// bootstrap();
