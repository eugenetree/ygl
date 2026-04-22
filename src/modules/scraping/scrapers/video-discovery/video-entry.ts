export type VideoEntryAvailability = "PUBLIC" | "MEMBERS_ONLY";

export type VideoEntry = {
  id: string;
  channelId: string;
  availability: VideoEntryAvailability;
  createdAt: Date;
  updatedAt: Date;
};

export type VideoEntryProps = Omit<VideoEntry, "createdAt" | "updatedAt">;
