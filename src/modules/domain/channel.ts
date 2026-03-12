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
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
};
