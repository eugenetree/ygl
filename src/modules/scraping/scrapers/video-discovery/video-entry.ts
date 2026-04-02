export type VideoEntry = {
  id: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type VideoEntryProps = Omit<VideoEntry, "createdAt" | "updatedAt">;
