import { injectable } from "inversify";

import { FindCaptionsUseCase } from "../../captions-search/find-captions.use-case.js";
import {
  errorSchema,
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
            200: searchResponseSchema,
            400: validationErrorSchema,
            500: errorSchema,
            503: errorSchema,
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
