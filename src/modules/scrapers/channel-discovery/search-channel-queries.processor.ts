import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { DatabaseError } from "../../../db/types.js";
import { SearchChannelQuery } from "../../domain/search-channel-query.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { SearchChannelEntry as YoutubeSearchChannelEntry, YoutubeApiSearchChannelsViaVideos } from "../../youtube-api/yt-api-search-channels-via-videos.js";
import { ChannelEntryRepository } from "./channel-entry.repository.js";
import { SearchChannelEntryService } from "../../domain/search-channel-entry.service.js";

@injectable()
export class SearchChannelQueriesProcessor {
	constructor(
		private readonly logger: Logger,
		private readonly youtubeApiSearchChannels: YoutubeApiSearchChannelsViaVideos,
		private readonly channelEntryRepository: ChannelEntryRepository,
		private readonly searchChannelEntryService: SearchChannelEntryService,
	) {
		this.logger.setContext(SearchChannelQueriesProcessor.name);
	}

	public async process(queryRecord: SearchChannelQuery) {
		const searchGenerator = this.youtubeApiSearchChannels.searchChannels({
			query: queryRecord.query,
		});

		for await (const searchResult of searchGenerator) {
			if (!searchResult.ok) {
				return Failure(searchResult.error);
			}

			const searchResponse = searchResult.value;

			if (searchResponse.status === "done") {
				break;
			}

			if (searchResponse.status === "found") {
				for (const channelEntry of searchResponse.chunk) {
					const processChannelEntryResult = await this.processChannelEntry({
						queryId: queryRecord.id,
						channelEntry,
					});

					if (!processChannelEntryResult.ok) {
						return Failure(processChannelEntryResult.error);
					}
				}
			}
		}

		return Success(undefined);
	}


	private async processChannelEntry({
		queryId,
		channelEntry,
	}: {
		queryId: string;
		channelEntry: YoutubeSearchChannelEntry;
	}) {
		this.logger.info(`Processing channel entry ${channelEntry.id}.`);

		const entryLookupResult = await this.channelEntryRepository.findById(
			channelEntry.id,
		);

		if (!entryLookupResult.ok) {
			this.logger.error({
				error: entryLookupResult.error,
				context: { channelId: channelEntry.id },
			});

			return Failure(entryLookupResult.error);
		}

		const existingChannel = entryLookupResult.value;
		if (existingChannel) {
			this.logger.info(
				`Channel (${existingChannel.id}) already exists in db. Skipping.`,
			);

			return Success(undefined);
		}

		const domainEntry = this.searchChannelEntryService.create({
			id: channelEntry.id,
			queryId,
		});

		const createChannelEntryResult =
			await this.channelEntryRepository.create(domainEntry);

		if (!createChannelEntryResult.ok) {
			this.logger.error({
				error: createChannelEntryResult.error,
				context: { channelId: channelEntry.id },
			});

			return Failure(createChannelEntryResult.error);
		}

		return Success(undefined);
	}
}