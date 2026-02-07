import { Logger } from "../../../modules/_common/logger/logger.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { ParsingError } from "../../_common/validation/errors.js";

/**
 * "https://www.youtube.com/@eugene_tree" -> "eugene_tree"
 * "https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw" -> null
 */
class UsernameParser {
  private readonly logger = new Logger({ context: UsernameParser.name });

  parse(string: string): Result<string, ParsingError> {
    const match = string.match(/@([^/]+)/);
    return match
      ? Success(match[1].toLowerCase())
      : Failure(
        {
          type: "PARSING_ERROR",
          message: "Could not parse username",
          context: { string },
        })
  }
}

export const usernameParser = new UsernameParser();
