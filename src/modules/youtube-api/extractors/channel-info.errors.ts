export class ChannelInfoExtractorError extends Error {
  public name = "ChannelInfoExtractorError";

  constructor(message: string) {
    super(message);
  }
}
