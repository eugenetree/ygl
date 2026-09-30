import { injectable } from "inversify";

import { FindCaptionsUseCase } from "../../captions-search/find-captions.use-case.js";
import {
  errorSchemaFor,
  searchQuerySchema,
  searchResponseSchema,
  validationErrorSchema,
} from "../contract/index.js";
import type { HttpApp, HttpController } from "../http-controller.js";
import { RouteFailure } from "../route-failure.js";

@injectable()
export class SearchController implements HttpController {
  constructor(private readonly findCaptionsUseCase: FindCaptionsUseCase) {}

  register(app: HttpApp): void {
    app.get(
      "/api/search",
      {
        schema: {
          querystring: searchQuerySchema,
          response: {
            200: searchResponseSchema.describe("Clips matching the query"),
            400: validationErrorSchema.describe("The query failed validation"),
            500: errorSchemaFor("INTERNAL_ERROR").describe(
              "Something unexpected went wrong",
            ),
            503: errorSchemaFor("SEARCH_UNAVAILABLE").describe(
              "Search is unavailable",
            ),
          },
        },
      },
      async (request) => {
        const { q, offset, limit } = request.query;
        const result = await this.findCaptionsUseCase.execute(q, {
          offset,
          limit,
        });
        if (!result.ok) {
          throw new RouteFailure(result.error);
        }
        return result.value;
      },
    );
  }
}
