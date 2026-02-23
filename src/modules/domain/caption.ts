export type Caption = {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  type: "auto" | "manual";
  videoId: string;
  createdAt: Date;
  updatedAt: Date;
};
