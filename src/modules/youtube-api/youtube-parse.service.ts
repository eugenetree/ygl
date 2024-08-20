import { Failure, Result, Success } from "../../types";
import { YoutubePageParseError } from "./youtube-parse.errors";

class YoutubePageParser {
  getDataObjectFromHtml(html: string): Result<any, YoutubePageParseError> {
    const pattern = /<script[^>]*>\s*var\s+ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/;

    const match = html.match(pattern);
    const jsonString = match?.[1];

    if (!jsonString) {
      return Failure(new YoutubePageParseError("Could not find JSON data in the HTML"));
    }

    try {
      return Success(JSON.parse(jsonString));
    } catch (err) {
      return Failure(new YoutubePageParseError("Could not parse JSON data"));
    }
  }
}

export const youtubePageParser = new YoutubePageParser();
