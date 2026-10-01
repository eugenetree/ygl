import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import fp from "fastify-plugin";

import type { Auth, User } from "../../auth/auth.js";
import type { ErrorResponse } from "../contract/index.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Answers NOT_SIGNED_IN unless the request carries a session. */
    signedIn: preHandlerAsyncHookHandler;
  }
  interface FastifyRequest {
    /** Set on routes behind `signedIn`, null on every other route. */
    user: User | null;
  }
}

export const authPlugin = fp<{ auth: Auth }>(async (app, { auth }) => {
  app.decorateRequest("user", null);

  app.decorate("signedIn", async (request, reply) => {
    const { headers, response: session } = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    // Looking a session up extends it, or clears the cookie of an expired one.
    for (const cookie of headers.getSetCookie()) {
      reply.header("set-cookie", cookie);
    }
    if (!session) {
      return reply.code(401).send({
        code: "NOT_SIGNED_IN",
        message: "Sign in to continue.",
      } satisfies ErrorResponse);
    }
    request.user = session.user;
  });

  app.register(async (scope) => {
    // better-auth parses the body itself, so it gets the raw bytes.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "*",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );

    scope.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      schema: { hide: true },
      handler: (request) => {
        const headers = fromNodeHeaders(request.headers);
        // better-auth's rate limiter keys on the first X-Forwarded-For address,
        // which any client can send; request.ip is the one Fastify trusts.
        headers.set("x-forwarded-for", request.ip);
        return auth.handler(
          new Request(`${request.protocol}://${request.host}${request.url}`, {
            method: request.method,
            headers,
            body: request.body as Buffer | undefined,
          }),
        );
      },
    });
  });
});

export function signedInUser(request: FastifyRequest): User {
  if (!request.user) {
    throw new Error(`${request.routeOptions.url} is not behind signedIn`);
  }
  return request.user;
}
