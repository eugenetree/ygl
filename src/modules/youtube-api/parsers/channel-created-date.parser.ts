import { Failure, Result, Success } from "../../../types/index.js";
import { ParsingError } from "../../_common/validation/errors.js";

class ChannelCreatedDateParser {
  parse(string: string): Result<Date, ParsingError> {
    const date = new Date(string);

    if (isNaN(date.getTime())) {
      return Failure(
        {
          type: "PARSING_ERROR",
          message: "Invalid date to parse",
          context: { string },
        })
    }

    return Success(date);
  }
}

export const channelCreatedDateParser = new ChannelCreatedDateParser();
