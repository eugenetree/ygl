import { Failure, Success } from "../../../../types/index.js";
import { QueriesRepository } from "./queries.repository.js";

export class MarkQueryAsFailedUseCase {
  constructor(private readonly queriesRepository: QueriesRepository) {}

  async execute(id: string) {
    const markAsFailedResult = await this.queriesRepository.markAsFailed(id);

    if (!markAsFailedResult.ok) {
      return Failure(markAsFailedResult.error);
    }

    return Success(markAsFailedResult.value);
  }
}