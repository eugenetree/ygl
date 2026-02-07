import { Failure, Result, Success } from "../../../types/index.js";
import { ParsingError } from "../../_common/validation/errors.js";

class JsonFromHtmlExtractor {
  getInitialData(html: unknown): Result<unknown, ParsingError> {
    if (typeof html !== "string") {
      return Failure({
        type: "PARSING_ERROR",
        message: "Input is not a string",
        context: { html },
      })
    }

    const pattern =
      /<script[^>]*>\s*var\s+ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/;

    const match = html.match(pattern);
    const jsonString = match?.[1];

    if (!jsonString) {
      return Failure({
        type: "PARSING_ERROR",
        message: "Could not find JSON data in the HTML",
        context: { html, jsonString },
      })
    }

    try {
      return Success(JSON.parse(jsonString));
    } catch (error) {
      return Failure({
        type: "PARSING_ERROR",
        message: "Could not parse JSON data",
        cause: error,
        context: { jsonString },
      })
    }
  }

  getPlayerResponse(html: unknown): Result<unknown, ParsingError> {
    if (typeof html !== "string") {
      return Failure({
        type: "PARSING_ERROR",
        message: "Input is not a string",
        context: { html },
      })
    }

    const pattern =
      /<script[^>]*>\s*var\s+ytInitialPlayerResponse\s*=\s*(\{.*?\});\s*<\/script>/;

    const match = html.match(pattern);
    const jsonString = match?.[1];

    if (!jsonString) {
      return Failure({
        type: "PARSING_ERROR",
        message: "Could not find JSON data in the HTML",
        context: { html, jsonString },
      })
    }

    try {
      return Success(JSON.parse(jsonString));
    } catch (error) {
      return Failure({
        type: "PARSING_ERROR",
        message: "Could not parse JSON data",
        cause: error,
        context: { jsonString },
      })
    }
  }
}

export const jsonFromHtmlExtractor = new JsonFromHtmlExtractor();
