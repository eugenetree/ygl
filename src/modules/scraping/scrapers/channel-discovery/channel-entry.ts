export type ChannelEntry = {
  id: string;
  queryId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelEntryProps = Omit<ChannelEntry, "createdAt" | "updatedAt">;
