type ChannelEntryStatus =
  | "PENDING"
  | "PROCESSING"
  | "ACCEPTED"
  | "REJECTED"
  | "FAILED";

export type SearchChannelEntry = {
  id: string;
  queryId: string;
  processingStatus: ChannelEntryStatus;
  createdAt: Date;
}