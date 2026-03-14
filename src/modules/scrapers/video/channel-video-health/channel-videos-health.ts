type CreateParams = {
  channelId: string;
}

type CreateParamsAll = CreateParams & {
  id: string;
  succeededVideosStreak: number;
  failedVideosStreak: number;
}

export class ChannelVideosHealth {
  constructor(
    public readonly id: string,
    public readonly channelId: string,
    public succeededVideosStreak: number,
    public failedVideosStreak: number,
  ) { }

  public static create({
    channelId,
  }: CreateParams) {
    return new ChannelVideosHealth(
      crypto.randomUUID(),
      channelId,
      0,
      0,
    );
  }

  public static _fromDb({
    id,
    channelId,
    succeededVideosStreak,
    failedVideosStreak
  }: CreateParamsAll) {
    return new ChannelVideosHealth(
      id,
      channelId,
      succeededVideosStreak,
      failedVideosStreak
    )
  }

  public trackVideoSuccess(): void {
    this.succeededVideosStreak += 1;
    this.failedVideosStreak = 0;
  }

  public trackVideoFailure(): void {
    this.failedVideosStreak += 1;
    this.succeededVideosStreak = 0;
  }
}