import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  videos: VideosTable;
  subtitles: SubtitlesTable;
}

export type VideosTable = {
  id: Generated<string>;

  youtubeId: string;
  title: string;
  duration: number;
  fullText: string;

  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, Date>;
};

export type Video = Selectable<VideosTable>;
export type NewVideo = Insertable<VideosTable>;
export type VideoUpdate = Updateable<VideosTable>;

export interface SubtitlesTable {
  id: Generated<string>;
  video_id: string;

  startTime: number;
  endtime: number;
  text: string;
}

export type Subtitle = Selectable<SubtitlesTable>;
export type NewSubtitle = Insertable<SubtitlesTable>;
export type SubtitleUpdate = Updateable<SubtitlesTable>;
