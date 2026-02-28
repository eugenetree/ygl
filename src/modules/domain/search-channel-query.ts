import { ProcessingStatus } from "../../db/types.js";

export type SearchChannelQuery = {
  id: string;
  query: string;
  processingStatus: ProcessingStatus;
  processingStatusUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};
