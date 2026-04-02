export type SearchChannelQuery = {
  id: string;
  query: string;
  createdAt: Date;
  updatedAt: Date | null;
};

export type SearchChannelQueryProps = Omit<SearchChannelQuery, "createdAt" | "updatedAt">;
