export class YoutubePageParseError extends Error {
  public name = "YoutubePageParseError";

  constructor(message: string) {
    super(message);
  }
}
