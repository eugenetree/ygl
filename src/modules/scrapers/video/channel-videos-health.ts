export type ChannelVideosHealth = {
  id: string;
  channelId: string;
  succeededVideosStreak: number;
  failedVideosStreak: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelVideosHealthProps = Omit<ChannelVideosHealth, "id" | "createdAt" | "updatedAt">;
