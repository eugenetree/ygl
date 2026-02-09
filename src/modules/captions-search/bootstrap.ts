import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { SyncDataToElasticUseCase } from "./sync-data-to-elastic.use-case.js";


export const bootstrap = async () => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: "captions-search",
      category: "elastic-sync",
    });
  });

  const syncDataToElasticUseCase = container.get(SyncDataToElasticUseCase);
  const result = await syncDataToElasticUseCase.execute();
  console.log(result);
}

bootstrap();