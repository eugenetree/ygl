export type ChannelProcessingStats = {
  id: string;
  channelId: string;
  totalProcessedCount: number;
  validCaptionsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelProcessingStatsProps = Omit<ChannelProcessingStats, "id" | "createdAt" | "updatedAt">;
