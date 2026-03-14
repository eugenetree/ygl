export type ChannelVideosHealth = {
  id: string;
  channelId: string;
  succeededVideosStreak: number;
  failedVideosStreak: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelVideoHealthProps = Omit<ChannelVideosHealth, "id" | "createdAt" | "updatedAt">;
