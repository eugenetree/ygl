import { Failure, Success } from "../../../../types/index.js";
import { QueriesRepository } from "./queries.repository.js";

export class MarkQueryAsSuccessUseCase {
  constructor(private readonly queriesRepository: QueriesRepository) {}

  async execute(id: string) {
    const markAsSuccessResult = await this.queriesRepository.markAsSuccess(id);

    if (!markAsSuccessResult.ok) {
      return Failure(markAsSuccessResult.error);
    }

    return Success(markAsSuccessResult.value);
  }
}