import { Generated, Insertable, Selectable, Updateable } from "kysely";

import { LanguageCode } from "../modules/i18n/index.js";

export type ProcessingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAIL";

export type ElasticCaptionsSyncStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";

export interface Database {
  searchChannelDirectQueries: SearchChannelDirectQueriesTable;
  searchChannelViaVideosQueries: SearchChannelViaVideosQueriesTable;
  channels: ChannelsTable;
  videos: VideosTable;
  channelVideosScrapeMetadata: ChannelVideosScrapeMetadataTable;
  captions: CaptionsTable;
  elasticCaptionsSync: ElasticCaptionsSyncTable;
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

export type ChannelDiscoveryStrategy = "direct" | "via-videos";

export interface ChannelsTable {
  id: string;
  name: string;
  description: string | null;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  countryCode: string | null;
  isFamilySafe: boolean;
  channelCreatedAt: Date;
  username: string;
  isArtist: boolean;
  discoveryStrategy: ChannelDiscoveryStrategy;
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
  languageCode: LanguageCode;
  captionType: "manual" | "auto";
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface CaptionsTable {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  videoId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChannelVideosScrapeMetadataTable {
  id: Generated<string>;
  channelId: string;
  firstProcessedVideoId: string | null;
  lastProcessedVideoId: string | null;
  processingStatus: ProcessingStatus;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  failReason:
  | "CHANNEL_HAS_NO_VIDEOS"
  | "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS"
  | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
  | null;
  videosWithValidCaptionsCount: number;
  videosWithNoCaptionsCount: number;
  videosWithNotSuitableCaptionsCount: number;
  consecutiveFailedVideosCount: number;
  totalFailedVideosCount: number;
  processedVideosCount: number;
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

export type ElasticCaptionsSync = Selectable<ElasticCaptionsSyncTable>;
export type InsertableElasticCaptionsSync = Insertable<ElasticCaptionsSyncTable>;
export type UpdateableElasticCaptionsSync = Updateable<ElasticCaptionsSyncTable>;

export type DatabaseError = {
  type: "DATABASE";
  error: Error;
};

export type DatabaseNothingToUpdateError = {
  type: "DATABASE_NOTHING_TO_UPDATE";
  id: string;
}