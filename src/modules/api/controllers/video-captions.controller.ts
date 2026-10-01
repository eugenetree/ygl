import { injectable } from "inversify";

import { FindVideoCaptionsUseCase } from "../../captions-search/find-video-captions.use-case.js";
import {
  errorSchemaFor,
  validationErrorSchema,
  videoCaptionsParamsSchema,
  videoCaptionsResponseSchema,
} from "../contract/index.js";
import type { HttpApp, HttpController } from "../http-controller.js";
import { RouteFailure } from "../route-failure.js";

@injectable()
export class VideoCaptionsController implements HttpController {
  constructor(
    private readonly findVideoCaptionsUseCase: FindVideoCaptionsUseCase,
  ) {}

  register(app: HttpApp): void {
    app.get(
      "/api/videos/:videoId/captions",
      {
        schema: {
          params: videoCaptionsParamsSchema,
          response: {
            200: videoCaptionsResponseSchema.describe(
              "The video's searchable captions, in the order they are spoken",
            ),
            400: validationErrorSchema.describe(
              "The video id failed validation",
            ),
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
        const result = await this.findVideoCaptionsUseCase.execute(
          request.params.videoId,
        );
        if (!result.ok) {
          throw new RouteFailure(result.error);
        }
        return { captions: result.value };
      },
    );
  }
}
