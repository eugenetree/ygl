import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { ParsingError } from "../../_common/validation/errors.js";

/*
  Parses abbreviated numbers like "1.2K subscribers" to 1200
  Supported abbreviations: K, M
  Supported formats: "1.2K any-text", "1.2K"
  Unsupported formats: "any-text 1.2K"
  Numbers w/o K or M are returned as is
*/

export class AbbreviatedNumberParser {
  private readonly logger = new Logger({
    context: AbbreviatedNumberParser.name,
  });

  parse(string: string): Result<number, ParsingError> {
    const tokens = string.split(" ");
    const tokenWithNumber = tokens[0];

    if (tokenWithNumber === undefined || isNaN(parseFloat(tokenWithNumber))) {
      return Failure(
        {
          type: "PARSING_ERROR",
          message: "Input does not contain a number",
          context: { string },
        })
    }

    let multiplier = 1;

    if (tokenWithNumber.endsWith("K")) {
      multiplier = 1000;
    }

    if (tokenWithNumber.endsWith("M")) {
      multiplier = 1000000;
    }

    const number = parseFloat(tokenWithNumber) * multiplier;

    return Success(Math.round(number));
  }
}

export const abbreviatedNumberParser = new AbbreviatedNumberParser();
