export type SearchChannelDirectQuery = {
  id: string;
  query: string;
  processingStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";
  processingStatusUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};
