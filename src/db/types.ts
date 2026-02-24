import { Generated, Insertable, Selectable, Updateable } from "kysely";

import { LanguageCode } from "../modules/i18n/index.js";

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
  | "CAPTIONS_PENDING_VALIDATION"
  | "CAPTIONS_EMPTY"
  | "CAPTIONS_TOO_SHORT"
  | "CAPTIONS_MOSTLY_UPPERCASE"
  | "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS"
  | "CAPTIONS_LOW_SIMILARITY_WITH_AUTO";

export type ChannelVideosScrapeProcessingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "TERMINATED_EARLY";

export type ElasticCaptionsSyncStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";

export interface Database {
  searchChannelDirectQueries: SearchChannelDirectQueriesTable;
  searchChannelViaVideosQueries: SearchChannelViaVideosQueriesTable;
  channels: ChannelsTable;
  videos: VideosTable;
  channelVideosScrapeMetadata: ChannelVideosScrapeMetadataTable;
  captions: CaptionsTable;
  elasticCaptionsSync: ElasticCaptionsSyncTable;
  searchChannelEntries: SearchChannelEntriesTable;
  videoEntries: VideoEntriesTable;
}

export interface SearchChannelDirectQueriesTable {
  id: string;
  query: string;
  processingStatus: ProcessingStatus;
  processingStatusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SearchChannelViaVideosQueriesTable {
  id: string;
  query: string;
  processingStatus: ProcessingStatus;
  processingStatusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SearchChannelEntriesTable {
  id: string;
  queryId: string;
  processingStatus: ProcessingStatus;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelsTable {
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
  videosDiscoveryStatus: Generated<ProcessingStatus>;
  videosDiscoveryStatusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface VideosTable {
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
  captionsProcessingStatus: Generated<ProcessingStatus>;
  captionsProcessingStatusUpdatedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface CaptionsTable {
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

export interface ChannelVideosScrapeMetadataTable {
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

export interface ElasticCaptionsSyncTable {
  id: Generated<string>;
  syncStatus: ElasticCaptionsSyncStatus;
  syncStartedAt: Date | null;
  syncCompletedAt: Date | null;
  latestSyncedCaptionId: string | null;
  failReason: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface VideoEntriesTable {
  id: string;
  channelId: string;
  processingStatus: ProcessingStatus;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type Channel = Selectable<ChannelsTable>;
export type InsertableChannel = Insertable<ChannelsTable>;
export type UpdateableChannel = Updateable<ChannelsTable>;

export type ChannelVideosScrapeMetadata =
  Selectable<ChannelVideosScrapeMetadataTable>;
export type InsertableChannelVideosScrapeMetadata =
  Insertable<ChannelVideosScrapeMetadataTable>;
export type UpdateableChannelVideosScrapeMetadata =
  Updateable<ChannelVideosScrapeMetadataTable>;

export type Video = Selectable<VideosTable>;
export type InsertableVideo = Insertable<VideosTable>;
export type UpdateableVideo = Updateable<VideosTable>;

export type Caption = Selectable<CaptionsTable>;
export type InsertableCaption = Insertable<CaptionsTable>;
export type UpdateableCaption = Updateable<CaptionsTable>;

export type SearchChannelDirectQuery = Selectable<SearchChannelDirectQueriesTable>;
export type InsertableSearchChannelDirectQuery = Insertable<SearchChannelDirectQueriesTable>;
export type UpdateableSearchChannelDirectQuery = Updateable<SearchChannelDirectQueriesTable>;

export type SearchChannelViaVideosQuery = Selectable<SearchChannelViaVideosQueriesTable>;
export type InsertableSearchChannelViaVideosQuery = Insertable<SearchChannelViaVideosQueriesTable>;
export type UpdateableSearchChannelViaVideosQuery = Updateable<SearchChannelViaVideosQueriesTable>;

export type SearchChannelEntryDb = Selectable<SearchChannelEntriesTable>;
export type InsertableSearchChannelEntryDb = Insertable<SearchChannelEntriesTable>;
export type UpdateableSearchChannelEntryDb = Updateable<SearchChannelEntriesTable>;

export type ElasticCaptionsSync = Selectable<ElasticCaptionsSyncTable>;
export type InsertableElasticCaptionsSync = Insertable<ElasticCaptionsSyncTable>;
export type UpdateableElasticCaptionsSync = Updateable<ElasticCaptionsSyncTable>;

export type VideoEntryDb = Selectable<VideoEntriesTable>;
export type InsertableVideoEntryDb = Insertable<VideoEntriesTable>;
export type UpdateableVideoEntryDb = Updateable<VideoEntriesTable>;

export type DatabaseError = {
  type: "DATABASE";
  error: Error;
};

export type DatabaseNothingToUpdateError = {
  type: "DATABASE_NOTHING_TO_UPDATE";
  id: string;
}