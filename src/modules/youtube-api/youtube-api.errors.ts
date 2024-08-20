export class YoutubeApiClientError extends Error {
  public name = "YoutubeApiClientError";

  constructor(message: string) {
    super(message);
  }
}
