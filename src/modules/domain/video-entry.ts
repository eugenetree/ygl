export type VideoEntry = {
  id: string;
  channelId: string;
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  createdAt: Date;
  updatedAt: Date;
};
