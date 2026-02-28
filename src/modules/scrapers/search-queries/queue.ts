import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError, SearchChannelViaVideosQuery } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";

@injectable()
export class Queue {
	constructor(private readonly logger: Logger) { }

	public async getNextQuery(): Promise<Result<
		SearchChannelViaVideosQuery | null,
		DatabaseError
	>> {
		const result =
			await tryCatch(
				dbClient
					.updateTable("searchChannelViaVideosQueries")
					.set({
						processingStatus: "PROCESSING",
					})
					.where(
						"id",
						"in",
						(eb) =>
							eb.selectFrom("searchChannelViaVideosQueries")
								.select("id")
								.where("processingStatus", "=", "PENDING")
								.limit(1)
								.forUpdate()
								.skipLocked()
					)
					.returningAll()
					.executeTakeFirst()
			)

		if (!result.ok) {
			return Failure({
				type: "DATABASE",
				error: result.error,
			})
		}

		const nextQuery = result.value;
		if (!nextQuery) {
			return Success(null);
		}

		return Success(nextQuery)
	}

	public async markAsSuccess(queryId: string): Promise<Result<void, DatabaseError>> {
		const result =
			await tryCatch(
				dbClient
					.updateTable("searchChannelViaVideosQueries")
					.set({
						processingStatus: "SUCCEEDED",
						processingStatusUpdatedAt: new Date(),
					})
					.where("id", "=", queryId)
					.execute()
			)

		if (!result.ok) {
			return Failure({
				type: "DATABASE",
				error: result.error,
			})
		}

		return Success(undefined)
	}

	public async markAsFailed(queryId: string): Promise<Result<void, DatabaseError>> {
		const result =
			await tryCatch(
				dbClient
					.updateTable("searchChannelViaVideosQueries")
					.set({
						processingStatus: "FAILED",
						processingStatusUpdatedAt: new Date(),
					})
					.where("id", "=", queryId)
					.execute()
			)

		if (!result.ok) {
			return Failure({
				type: "DATABASE",
				error: result.error,
			})
		}

		return Success(undefined)
	}
}