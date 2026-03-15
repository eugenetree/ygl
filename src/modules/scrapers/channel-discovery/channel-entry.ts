export type ChannelEntry = {
  id: string;
  queryId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelEntryProps = Omit<ChannelEntry, "createdAt" | "updatedAt">;
