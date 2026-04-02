import { Generated, Insertable, Selectable, Updateable } from "kysely";

import { LanguageCode } from "../modules/i18n/index.js";
import type { ScraperName } from "../modules/scraping/constants.js";

export type ProcessingStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export type AutoCaptionsStatus =
  | "CAPTIONS_ABSENT"
  | "CAPTIONS_VALID"
  | "CAPTIONS_EMPTY"
  | "CAPTIONS_TOO_SHORT";

export type ManualCaptionsStatus =
  | "CAPTIONS_ABSENT"
  | "CAPTIONS_VALID"
  | "CAPTIONS_EMPTY"
  | "CAPTIONS_TOO_SHORT"
  | "CAPTIONS_MOSTLY_UPPERCASE"
  | "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS"

export type ChannelVideosScrapeProcessingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "TERMINATED_EARLY";

export type ElasticCaptionsSyncStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";

export interface Database {
  searchChannelQueries: SearchChannelQueriesRow;
  channels: ChannelsRow;
  videos: VideosRow;
  channelVideosScrapeMetadata: ChannelVideosScrapeMetadataRow;
  captions: CaptionsRow;
  elasticCaptionsSync: ElasticCaptionsSyncRow;
  channelEntries: ChannelEntriesRow;
  videoEntries: VideoEntriesRow;
  channelDiscoveryJobs: ChannelDiscoveryJobsRow;
  channelJobs: ChannelJobsRow;
  videoDiscoveryJobs: VideoDiscoveryJobsRow;
  videoJobs: VideoJobsRow;
  transcriptionJobs: TranscriptionJobsRow;
  channelVideosHealth: ChannelVideoHealthRow;
  scraperConfig: ScraperConfigRow;
}

export interface ScraperConfigRow {
  scraperName: ScraperName;
  enabled: boolean;
}

export interface ChannelDiscoveryJobsRow {
  id: Generated<string>;
  searchQueryId: string;
  status: ProcessingStatus;
  statusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface ChannelJobsRow {
  id: Generated<string>;
  channelId: string;
  status: ProcessingStatus;
  statusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface VideoDiscoveryJobsRow {
  id: Generated<string>;
  channelId: string;
  status: ProcessingStatus;
  statusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface VideoJobsRow {
  id: Generated<string>;
  videoId: string;
  channelId: string;
  status: ProcessingStatus;
  statusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface TranscriptionJobsRow {
  id: Generated<string>;
  videoId: string;
  status: ProcessingStatus;
  statusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
}


export interface SearchChannelQueriesRow {
  id: string;
  query: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelEntriesRow {
  id: string;
  queryId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelsRow {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  countryCode: string | null;
  isFamilySafe: boolean;
  channelCreatedAt: Date;
  username: string;
  isArtist: boolean;
  keywords: string[];
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface VideosRow {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  channelId: string;
  viewCount: number;
  thumbnail: string;
  languageCode: LanguageCode | null;
  autoCaptionsStatus: AutoCaptionsStatus;
  manualCaptionsStatus: ManualCaptionsStatus;
  captionsSimilarityScore: number | null;
  asr: number | null;
  abr: number | null;
  acodec: string | null;
  audioChannels: number | null;
  audioQuality: string | null;
  isDrc: boolean | null;
  categories: string[];
  track: string | null;
  artist: string | null;
  album: string | null;
  creator: string | null;
  captionsShift: number | null;
  captionsProcessingAlgorithmVersion: string | null;
  uploadedAt: Date | null;
  description: string | null;
  likeCount: number | null;
  commentCount: number | null;
  availability: string | null;
  playableInEmbed: boolean | null;
  channelIsVerified: boolean | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface CaptionsRow {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  type: "manual" | "auto";
  videoId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelVideosScrapeMetadataRow {
  id: Generated<string>;
  channelId: string;
  firstVideoId: string | null;
  lastVideoId: string | null;
  processingStatus: ChannelVideosScrapeProcessingStatus;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  failureReason:
  | "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS"
  | (string & {})
  | null;
  terminationReason:
  | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
  | "CHANNEL_HAS_TOO_MANY_VIDEOS"
  | "CHANNEL_HAS_NO_VIDEOS"
  | null;
  videosBothCaptionsValid: number;
  videosNoCaptionsValid: number;
  videosOnlyManualCaptionsValid: number;
  videosOnlyAutoCaptionsValid: number;
  videosAll: number;
  videosSkippedAlreadyProcessed: number;
  videosFailed: number;
  videosProcessed: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ElasticCaptionsSyncRow {
  id: Generated<string>;
  syncStatus: ElasticCaptionsSyncStatus;
  syncStartedAt: Date | null;
  syncCompletedAt: Date | null;
  latestSyncedCaptionId: string | null;
  failReason: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface VideoEntriesRow {
  id: string;
  channelId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelVideoHealthRow {
  id: string;
  channelId: string;
  succeededVideosStreak: number;
  failedVideosStreak: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type ChannelRow = Selectable<ChannelsRow>;
export type InsertableChannelRow = Insertable<ChannelsRow>;
export type UpdateableChannelRow = Updateable<ChannelsRow>;

export type ChannelVideosScrapeMetadataSelectable =
  Selectable<ChannelVideosScrapeMetadataRow>;
export type InsertableChannelVideosScrapeMetadata =
  Insertable<ChannelVideosScrapeMetadataRow>;
export type UpdateableChannelVideosScrapeMetadata =
  Updateable<ChannelVideosScrapeMetadataRow>;

export type VideoRow = Selectable<VideosRow>;
export type InsertableVideoRow = Insertable<VideosRow>;
export type UpdateableVideoRow = Updateable<VideosRow>;

export type CaptionRow = Selectable<CaptionsRow>;
export type InsertableCaptionRow = Insertable<CaptionsRow>;
export type UpdateableCaptionRow = Updateable<CaptionsRow>;

export type SearchChannelQueryRow = Selectable<SearchChannelQueriesRow>;
export type InsertableSearchChannelQueryRow = Insertable<SearchChannelQueriesRow>;
export type UpdateableSearchChannelQueryRow = Updateable<SearchChannelQueriesRow>;

export type ChannelEntryRow = Selectable<ChannelEntriesRow>;
export type InsertableChannelEntryRow = Insertable<ChannelEntriesRow>;
export type UpdateableChannelEntryRow = Updateable<ChannelEntriesRow>;

export type ElasticCaptionsSyncSelectable = Selectable<ElasticCaptionsSyncRow>;
export type InsertableElasticCaptionsSyncRow = Insertable<ElasticCaptionsSyncRow>;
export type UpdateableElasticCaptionsSyncRow = Updateable<ElasticCaptionsSyncRow>;

export type VideoEntryRow = Selectable<VideoEntriesRow>;
export type InsertableVideoEntryRow = Insertable<VideoEntriesRow>;
export type UpdateableVideoEntryRow = Updateable<VideoEntriesRow>;

export type DatabaseError = {
  type: "DATABASE";
  error: Error;
};

export type DatabaseNothingToUpdateError = {
  type: "DATABASE_NOTHING_TO_UPDATE";
  id: string;
}
