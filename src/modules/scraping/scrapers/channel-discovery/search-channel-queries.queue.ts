import { dbClient } from "../../../../db/client.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError } from "../../../../db/types.js";
import { SearchChannelQuery } from "./search-channel-query.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { sql } from "kysely";

@injectable()
export class SearchChannelQueriesQueue {
	constructor(private readonly logger: Logger) { }

	public async getNextQuery(): Promise<Result<SearchChannelQuery | null, DatabaseError>> {
		const result = await tryCatch(
			dbClient.transaction().execute(async (trx) => {
				const rows = await trx
					.updateTable("searchChannelQueries")
					.set({ channelDiscoveryStatus: "RUNNING", channelDiscoveryStatusUpdatedAt: new Date() })
					.where(
						"id",
						"in",
						(eb) =>
							eb.selectFrom("searchChannelQueries")
								.select("id")
								.where("channelDiscoveryStatus", "=", "PENDING")
								.orderBy(sql`random()`)
								.limit(1)
								.forUpdate()
								.skipLocked(),
					)
					.returning(["id", "query", "createdAt", "updatedAt"])
					.executeTakeFirst();

				return rows ?? null;
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
				.updateTable("searchChannelQueries")
				.set({ channelDiscoveryStatus: "SUCCEEDED", channelDiscoveryError: null, channelDiscoveryStatusUpdatedAt: new Date() })
				.where("id", "=", queryId)
				.execute()
		);

		if (!result.ok) {
			return Failure({ type: "DATABASE", error: result.error });
		}

		return Success(undefined);
	}

	public async markAsFailed(queryId: string, error?: string): Promise<Result<void, DatabaseError>> {
		const result = await tryCatch(
			dbClient
				.updateTable("searchChannelQueries")
				.set({ channelDiscoveryStatus: "FAILED", channelDiscoveryError: error ?? null, channelDiscoveryStatusUpdatedAt: new Date() })
				.where("id", "=", queryId)
				.execute()
		);

		if (!result.ok) {
			return Failure({ type: "DATABASE", error: result.error });
		}

		return Success(undefined);
	}
}
