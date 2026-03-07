export type ChannelEntry = {
  id: string;
  queryId: string;
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  createdAt: Date;
  updatedAt: Date;
}