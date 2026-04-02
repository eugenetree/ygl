import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "../../../../../_common/logger/logger.js";
import { ReprocessCaptionsUseCase } from "./reprocess-captions.use-case.js";

const bootstrap = async () => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: ReprocessCaptionsUseCase.name,
      category: "reprocess-captions",
    });
  });

  const useCase = container.get(ReprocessCaptionsUseCase);
  const result = await useCase.execute();

  if (!result.ok) {
    console.error("Reprocessing failed:", result.error);
    process.exit(1);
  }
};

bootstrap();
