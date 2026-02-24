export type Channel = {
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
  videosDiscoveryStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  videosDiscoveryStatusUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
