import { injectable } from "inversify";

import { errorSchemaFor, meResponseSchema } from "../contract/index.js";
import type { HttpApp, HttpController } from "../http-controller.js";
import { signedInUser } from "../plugins/auth.plugin.js";

@injectable()
export class MeController implements HttpController {
  register(app: HttpApp): void {
    app.get(
      "/api/me",
      {
        preHandler: app.signedIn,
        schema: {
          response: {
            200: meResponseSchema.describe("The signed-in user"),
            401: errorSchemaFor("NOT_SIGNED_IN").describe(
              "The request carries no session",
            ),
            500: errorSchemaFor("INTERNAL_ERROR").describe(
              "Something unexpected went wrong",
            ),
          },
        },
      },
      async (request) => {
        const { id, name, email, image } = signedInUser(request);
        return { id, name, email, avatarUrl: image ?? null };
      },
    );
  }
}
