import { Failure, Result, Success } from "../../../types/index.js";
import { ParsingError } from "../../_common/validation/errors.js";

class VideoCountParser {
  parse(string: string): Result<number, ParsingError> {
    const parsedValue = parseInt(string.replace(/,/g, ""));

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

export const videoCountParser = new VideoCountParser();
