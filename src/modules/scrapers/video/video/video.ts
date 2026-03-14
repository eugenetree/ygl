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

export type VideoProps = {
  id: string;
  title: string;
  duration: number;
  keywords: string[];
  viewCount: number;
  thumbnail: string;
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
  channelId: string;
  uploadedAt: Date | null;
  description: string | null;
  likeCount: number | null;
  commentCount: number | null;
  availability: string | null;
  playableInEmbed: boolean | null;
  channelIsVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateParams = Omit<VideoProps, "id" | "createdAt" | "updatedAt">;

export class Video {
  constructor(private props: VideoProps) { }

  static create(params: CreateParams): Video {
    const now = new Date();
    return new Video({
      ...params,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  }

  static _fromDb(props: VideoProps): Video {
    return new Video(props);
  }

  get id() { return this.props.id; }
  get channelId() { return this.props.channelId; }
  get categories() { return this.props.categories; }
  get track() { return this.props.track; }
  get artist() { return this.props.artist; }
  get album() { return this.props.album; }

  toProps(): VideoProps {
    return { ...this.props };
  }
}
