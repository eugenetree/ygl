import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError } from "../../../db/types.js";
import { SearchChannelQuery } from "../../domain/search-channel-query.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";

@injectable()
export class SearchChannelQueriesQueue {
	constructor(private readonly logger: Logger) { }

	public async getNextQuery(): Promise<Result<
		SearchChannelQuery | null,
		DatabaseError
	>> {
		const result = await tryCatch(
			dbClient.transaction().execute(async (trx) => {
				const job = await trx
					.updateTable("channelDiscoveryJobs")
					.set({ status: "PROCESSING", statusUpdatedAt: new Date() })
					.where(
						"id",
						"in",
						(eb) =>
							eb.selectFrom("channelDiscoveryJobs")
								.select("id")
								.where("status", "=", "PENDING")
								.limit(1)
								.forUpdate()
								.skipLocked(),
					)
					.returning("searchQueryId")
					.executeTakeFirst();

				if (!job) return null;

				return trx
					.selectFrom("searchChannelQueries")
					.selectAll()
					.where("id", "=", job.searchQueryId)
					.executeTakeFirst();
			})
		);

		if (!result.ok) {
			return Failure({ type: "DATABASE", error: result.error });
		}

		return Success(result.value ?? null);
	}

	public async markAsSuccess(queryId: string): Promise<Result<void, DatabaseError>> {
		const result = await tryCatch(
			dbClient
				.updateTable("channelDiscoveryJobs")
				.set({ status: "SUCCEEDED", statusUpdatedAt: new Date() })
				.where("searchQueryId", "=", queryId)
				.execute()
		);

		if (!result.ok) {
			return Failure({ type: "DATABASE", error: result.error });
		}

		return Success(undefined);
	}

	public async markAsFailed(queryId: string): Promise<Result<void, DatabaseError>> {
		const result = await tryCatch(
			dbClient
				.updateTable("channelDiscoveryJobs")
				.set({ status: "FAILED", statusUpdatedAt: new Date() })
				.where("searchQueryId", "=", queryId)
				.execute()
		);

		if (!result.ok) {
			return Failure({ type: "DATABASE", error: result.error });
		}

		return Success(undefined);
	}
}
