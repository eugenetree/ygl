export type SearchChannelViaVideosQuery = {
  id: string;
  query: string;
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  processingStatusUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};
