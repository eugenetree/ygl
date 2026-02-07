import { Failure, Result, Success } from "../../../types/index.js";
import { ParsingError } from "../../_common/validation/errors.js";

/**
 * Turns a string like "02:02" into 122 (02 * 60 + 02)
 */
class VideoDurationParser {
  parse(string: string): Result<number, ParsingError> {
    const [leftToken, rightToken] = string.split(":");
    const minutes = parseInt(leftToken);
    const seconds = parseInt(rightToken);
    const parsedValue = minutes * 60 + seconds;

    return isNaN(parsedValue)
      ? Failure(
        {
          type: "PARSING_ERROR",
          message: "Number can't be parsed",
          context: { string },
        })
      : Success(parsedValue);
  }
}

export const videoDurationParser = new VideoDurationParser();
