import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import type { InjectOptions } from "fastify";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../../db/types.js";
import { Failure, Success } from "../../types/index.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import type { User } from "../auth/auth.js";
import {
  createTestAuth,
  TEST_AUTH_SETTINGS,
} from "../auth/testing/test-auth.js";
import type { FindCaptionsUseCase } from "../captions-search/find-captions.use-case.js";
import { MeController } from "./controllers/me.controller.js";
import { SearchController } from "./controllers/search.controller.js";
import type { HttpController } from "./http-controller.js";
import { buildHttpServer } from "./http-server.js";

const FRONTEND_ORIGIN = TEST_AUTH_SETTINGS.frontendOrigin;

// ---- Fixtures ---------------------------------------------------------------

const clip = {
  captionId: "caption-1",
  videoId: "video-1",
  startTime: 2500,
  endTime: 4200,
  text: "never gonna give you up",
  playFrom: 1500,
};

type SearchArgs = Parameters<FindCaptionsUseCase["execute"]>;

const found = (clips = [clip], total = clips.length, isTotalExact = true) =>
  Success({ clips, total, isTotalExact });

const SESSION_COOKIE = "better-auth.session_token=token.signature";

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: async () => {
      throw new Error("These tests have no database");
    },
  }),
});
after(() => db.destroy());

const user: User = {
  id: "5036b8d4-b9f3-4afb-ba59-49b6c32d3f83",
  name: "Ada Lovelace",
  email: "ada@example.com",
  emailVerified: true,
  image: "https://lh3.googleusercontent.com/a/ada",
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
};

function stubAuth(
  session: { user: User } | null = null,
  cookies: string[] = [],
) {
  const auth = createTestAuth(db);
  mock.method(auth, "handler", async (request: Request) =>
    Response.json(
      {
        method: request.method,
        url: request.url,
        cookie: request.headers.get("cookie"),
        forwardedFor: request.headers.get("x-forwarded-for"),
        body: await request.text(),
      },
      {
        status: 202,
        headers: [
          ["set-cookie", "better-auth.state=abc; Path=/; HttpOnly"],
          ["set-cookie", "better-auth.pkce=def; Path=/; HttpOnly"],
        ],
      },
    ),
  );
  mock.method(
    auth.api,
    "getSession",
    async ({ headers }: { headers: Headers }) => ({
      headers: new Headers(cookies.map((cookie) => ["set-cookie", cookie])),
      response: headers.get("cookie") === SESSION_COOKIE ? session : null,
    }),
  );
  return auth;
}

// ---- Factory ----------------------------------------------------------------

function createMocks(
  execute: FindCaptionsUseCase["execute"] = async () => found(),
  auth = stubAuth(),
) {
  return {
    logger: createLoggerMock(),
    findCaptionsUseCase: { execute: mock.fn(execute) },
    auth,
  };
}

function buildSut(
  mocks: ReturnType<typeof createMocks>,
  controllers: HttpController[] = [
    new SearchController(
      mocks.findCaptionsUseCase as unknown as FindCaptionsUseCase,
    ),
    new MeController(),
  ],
) {
  return buildHttpServer({
    logger: mocks.logger as unknown as Logger,
    frontendOrigin: FRONTEND_ORIGIN,
    auth: mocks.auth,
    controllers,
  });
}

async function search(
  mocks: ReturnType<typeof createMocks>,
  query: Record<string, string>,
  options: Pick<InjectOptions, "remoteAddress" | "headers"> = {},
) {
  const app = buildSut(mocks);
  const response = await app.inject({
    method: "GET",
    url: "/api/search",
    query,
    ...options,
  });
  await app.close();
  return response;
}

async function me(
  auth: ReturnType<typeof stubAuth>,
  headers: InjectOptions["headers"] = { cookie: SESSION_COOKIE },
) {
  const app = buildSut(createMocks(undefined, auth));
  const response = await app.inject({ method: "GET", url: "/api/me", headers });
  await app.close();
  return response;
}

// ---- Tests ------------------------------------------------------------------

describe("GET /api/search", () => {
  it("returns the clips, the total and whether the total is exact", async () => {
    const mocks = createMocks(async () => found([clip], 10000, false));

    const response = await search(mocks, { q: "give you up" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      clips: [clip],
      total: 10000,
      isTotalExact: false,
    });
  });
});

describe("GET /api/me", () => {
  it("returns the signed-in user's id, name, email and avatar URL", async () => {
    const response = await me(stubAuth({ user }));

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      id: "5036b8d4-b9f3-4afb-ba59-49b6c32d3f83",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
    });
  });

  it("returns a null avatar URL for a user without a picture", async () => {
    const response = await me(stubAuth({ user: { ...user, image: null } }));

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().avatarUrl, null);
  });

  it("answers NOT_SIGNED_IN with 401 without a session", async () => {
    const response = await me(stubAuth(), {});

    assert.equal(response.statusCode, 401);
    const body = response.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
    assert.equal(body.code, "NOT_SIGNED_IN");
  });

  it("passes on the session cookie better-auth refreshes", async () => {
    const refreshed =
      "better-auth.session_token=token.signature; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax";
    const response = await me(stubAuth({ user }, [refreshed]));

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["set-cookie"], refreshed);
  });

  it("passes on the cookies better-auth clears for an expired session", async () => {
    const cleared = [
      "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      "better-auth.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    ];
    const response = await me(stubAuth(null, cleared));

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.headers["set-cookie"], cleared);
  });
});

describe("better-auth's routes", () => {
  it("hands better-auth the request and relays its response", async () => {
    const app = buildSut(createMocks());
    const body = JSON.stringify({
      provider: "google",
      callbackURL: "https://saythis.cc/hello",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/social?disableRedirect=false",
      headers: { "content-type": "application/json", cookie: SESSION_COOKIE },
      payload: body,
    });
    await app.close();

    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.headers["set-cookie"], [
      "better-auth.state=abc; Path=/; HttpOnly",
      "better-auth.pkce=def; Path=/; HttpOnly",
    ]);
    const received = response.json();
    assert.equal(received.method, "POST");
    const url = new URL(received.url);
    assert.equal(
      url.pathname + url.search,
      "/api/auth/sign-in/social?disableRedirect=false",
    );
    assert.equal(received.cookie, SESSION_COOKIE);
    assert.equal(received.body, body);
  });

  it("hands over a GET without a body, as Google's callback is", async () => {
    const app = buildSut(createMocks());

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/callback/google?code=4%2F0Ab&state=xyz",
    });
    await app.close();

    assert.equal(response.statusCode, 202);
    const received = response.json();
    assert.equal(received.method, "GET");
    assert.equal(new URL(received.url).search, "?code=4%2F0Ab&state=xyz");
    assert.equal(received.body, "");
  });

  async function addressGivenToAuth(
    remoteAddress: string,
    forwardedFor: string,
  ) {
    const app = buildSut(createMocks());
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      remoteAddress,
      headers: { "x-forwarded-for": forwardedFor },
    });
    await app.close();
    return response.json().forwardedFor;
  }

  it("tells better-auth the client address the proxy forwarded", async () => {
    assert.equal(
      await addressGivenToAuth("10.0.1.5", "198.51.100.1, 203.0.113.7"),
      "203.0.113.7",
    );
  });

  it("tells better-auth the address of a client reaching the API directly", async () => {
    assert.equal(
      await addressGivenToAuth("198.51.100.20", "203.0.113.7"),
      "198.51.100.20",
    );
  });
});

describe("better-auth's routes this API does not offer", () => {
  const notOffered: [InjectOptions["method"], string][] = [
    ["POST", "/api/auth/update-user"],
    ["GET", "/api/auth/delete-user/callback?token=abc"],
    ["POST", "/api/auth/link-social"],
    ["POST", "/api/auth/unlink-account"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/get-access-token"],
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/request-password-reset"],
    ["GET", "/api/auth/reset-password/abc"],
    ["GET", "/api/auth/reference"],
    ["GET", "/api/auth/open-api/generate-schema"],
  ];

  for (const [method, url] of notOffered) {
    it(`answers 404 to ${method} ${url}`, async () => {
      const app = buildSut(createMocks(undefined, createTestAuth(db)));

      const response = await app.inject({
        method,
        url,
        headers: {
          origin: FRONTEND_ORIGIN,
          "content-type": "application/json",
        },
        payload: method === "POST" ? "{}" : undefined,
      });
      await app.close();

      assert.equal(response.statusCode, 404, response.body);
    });
  }
});

describe("GET /api/search validation", () => {
  it("rejects a missing q, naming the field", async () => {
    const mocks = createMocks();

    const response = await search(mocks, {});

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.equal(typeof body.message, "string");
    assert.deepEqual(
      body.issues.map((issue: { field: string }) => issue.field),
      ["q"],
    );
    assert.equal(mocks.findCaptionsUseCase.execute.mock.callCount(), 0);
  });

  const rejected: [string, Record<string, string>, string | string[]][] = [
    ["a blank q", { q: "   " }, "q"],
    ["a q over 200 characters", { q: "a".repeat(201) }, "q"],
    ["a limit over 50", { q: "hello", limit: "51" }, "limit"],
    ["a limit of 0", { q: "hello", limit: "0" }, "limit"],
    ["a limit that is not a number", { q: "hello", limit: "ten" }, "limit"],
    ["a negative offset", { q: "hello", offset: "-1" }, "offset"],
    ["a fractional offset", { q: "hello", offset: "1.5" }, "offset"],
    [
      "offset + limit over 10,000",
      { q: "hello", offset: "9981", limit: "20" },
      ["offset", "limit"],
    ],
  ];

  for (const [name, query, field] of rejected) {
    it(`rejects ${name}`, async () => {
      const mocks = createMocks();

      const response = await search(mocks, query);

      assert.equal(response.statusCode, 400);
      const body = response.json();
      assert.equal(body.code, "VALIDATION_ERROR");
      assert.deepEqual(
        body.issues.map((issue: { field: string }) => issue.field),
        [field].flat(),
      );
    });
  }

  const accepted: [string, Record<string, string>, SearchArgs][] = [
    [
      "defaults to the first 20 clips",
      { q: "hello" },
      ["hello", { offset: 0, limit: 20 }],
    ],
    [
      "trims q",
      { q: "  give you up  " },
      ["give you up", { offset: 0, limit: 20 }],
    ],
    [
      "accepts a q of exactly 200 characters",
      { q: "a".repeat(200) },
      ["a".repeat(200), { offset: 0, limit: 20 }],
    ],
    [
      "accepts a limit of 50",
      { q: "hello", limit: "50" },
      ["hello", { offset: 0, limit: 50 }],
    ],
    [
      "accepts offset + limit of exactly 10,000",
      { q: "hello", offset: "9980", limit: "20" },
      ["hello", { offset: 9980, limit: 20 }],
    ],
  ];

  for (const [name, query, expected] of accepted) {
    it(name, async () => {
      const mocks = createMocks();

      const response = await search(mocks, query);

      assert.equal(response.statusCode, 200);
      assert.deepEqual(
        mocks.findCaptionsUseCase.execute.mock.calls[0].arguments,
        expected,
      );
    });
  }
});

describe("errors", () => {
  it("answers SEARCH_UNAVAILABLE with 503 when search fails", async () => {
    const mocks = createMocks(async () =>
      Failure({
        type: "SEARCH_UNAVAILABLE" as const,
        error: new Error("connect ECONNREFUSED 10.0.0.5:9200"),
      }),
    );

    const response = await search(mocks, { q: "hello" });

    assert.equal(response.statusCode, 503);
    const body = response.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
    assert.equal(body.code, "SEARCH_UNAVAILABLE");
    assert.doesNotMatch(body.message, /ECONNREFUSED/);
  });

  it("answers INTERNAL_ERROR with 500 for anything unexpected, logging it but not echoing it", async () => {
    const thrown = new Error('relation "captions" does not exist');
    const mocks = createMocks(async () => {
      throw thrown;
    });

    const response = await search(mocks, { q: "hello" });

    assert.equal(response.statusCode, 500);
    const body = response.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.doesNotMatch(body.message, /captions/);
    assert.ok(
      mocks.logger.error.mock.calls.some(
        (call) => call.arguments[0].error === thrown,
      ),
    );
  });

  it("answers NOT_FOUND with 404 for a route that does not exist", async () => {
    const app = buildSut(createMocks());

    const response = await app.inject({ method: "GET", url: "/api/nope" });
    await app.close();

    assert.equal(response.statusCode, 404);
    const body = response.json();
    assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
    assert.equal(body.code, "NOT_FOUND");
  });
});

describe("CORS", () => {
  async function preflight(origin: string) {
    const app = buildSut(createMocks());
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/search?q=hello",
      headers: { origin, "access-control-request-method": "GET" },
    });
    await app.close();
    return response;
  }

  it("lets the frontend origin make credentialed requests", async () => {
    const response = await preflight(FRONTEND_ORIGIN);

    assert.equal(
      response.headers["access-control-allow-origin"],
      FRONTEND_ORIGIN,
    );
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  });

  it("does not allow any other origin", async () => {
    const response = await preflight("https://evil.example");

    assert.equal(response.headers["access-control-allow-origin"], undefined);
  });

  it("names the frontend origin on actual responses", async () => {
    const app = buildSut(createMocks());
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=hello",
      headers: { origin: FRONTEND_ORIGIN },
    });
    await app.close();

    assert.equal(
      response.headers["access-control-allow-origin"],
      FRONTEND_ORIGIN,
    );
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  });
});

describe("request logging", () => {
  it("logs one line per request with method, route, status, duration and client address", async () => {
    const mocks = createMocks();

    await search(mocks, { q: "hello" });

    const lines = mocks.logger.info.mock.calls.map((call) => call.arguments[0]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^GET \/api\/search 200 \d+ms 127\.0\.0\.1$/);
  });
});

describe("behind the proxy", () => {
  const PROXY_ADDRESS = "10.0.1.5";

  async function loggedLine(remoteAddress: string, forwardedFor: string) {
    const mocks = createMocks();
    await search(
      mocks,
      { q: "hello" },
      { remoteAddress, headers: { "x-forwarded-for": forwardedFor } },
    );
    return mocks.logger.info.mock.calls[0].arguments[0];
  }

  it("logs the client's address the proxy forwarded, not the proxy's", async () => {
    const line = await loggedLine(PROXY_ADDRESS, "203.0.113.7");

    assert.match(line, / 203\.0\.113\.7$/);
  });

  it("trusts only the proxy's own entry in X-Forwarded-For", async () => {
    const line = await loggedLine(PROXY_ADDRESS, "198.51.100.1, 203.0.113.7");

    assert.match(line, / 203\.0\.113\.7$/);
  });

  it("ignores X-Forwarded-For from a client that reaches the API directly", async () => {
    const line = await loggedLine("198.51.100.20", "203.0.113.7");

    assert.match(line, / 198\.51\.100\.20$/);
  });

  it("gives controllers the scheme the proxy forwarded", async () => {
    const app = buildSut(createMocks(), [
      {
        register: (app) =>
          app.get("/api/scheme", async (request) => request.protocol),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/scheme",
      remoteAddress: PROXY_ADDRESS,
      headers: { "x-forwarded-proto": "https" },
    });
    await app.close();

    assert.equal(response.body, "https");
  });
});

describe("API docs", () => {
  async function openApiDocument() {
    const app = buildSut(createMocks());
    const response = await app.inject({ method: "GET", url: "/api/docs/json" });
    await app.close();
    assert.equal(response.statusCode, 200);
    return response.json();
  }

  function resolve(document: Record<string, unknown>, ref: string) {
    assert.match(ref, /^#\//);
    let node: unknown = document;
    for (const key of ref.slice(2).split("/")) {
      assert.ok(
        node && typeof node === "object" && key in node,
        `${ref} does not resolve`,
      );
      node = (node as Record<string, unknown>)[key];
    }
    // biome-ignore lint/suspicious/noExplicitAny: walked into untyped JSON
    return node as any;
  }

  // biome-ignore lint/suspicious/noExplicitAny: walked into untyped JSON
  function getSessionSchema(document: any) {
    return document.paths["/api/auth/get-session"].get.responses["200"].content[
      "application/json"
    ].schema;
  }

  it("serves an OpenAPI document listing the search route with its query, response and error codes", async () => {
    const document = await openApiDocument();

    assert.match(document.openapi, /^3\./);
    const search = document.paths["/api/search"].get;
    assert.deepEqual(
      search.parameters.map(
        (parameter: { name: string; in: string }) =>
          `${parameter.in}:${parameter.name}`,
      ),
      ["query:q", "query:offset", "query:limit"],
    );
    assert.deepEqual(Object.keys(search.responses).sort(), [
      "200",
      "400",
      "500",
      "503",
    ]);
    const errorCodes = (status: string) =>
      search.responses[status].content["application/json"].schema.properties
        .code.enum;
    assert.deepEqual(errorCodes("400"), ["VALIDATION_ERROR"]);
    assert.deepEqual(errorCodes("500"), ["INTERNAL_ERROR"]);
    assert.deepEqual(errorCodes("503"), ["SEARCH_UNAVAILABLE"]);
  });

  it("lists only the better-auth routes this API offers: Google sign-in, the session, sign-out and account deletion", async () => {
    const { paths } = await openApiDocument();

    assert.deepEqual(
      Object.keys(paths)
        .filter((path) => path.startsWith("/api/auth/"))
        .sort(),
      [
        "/api/auth/callback/{id}",
        "/api/auth/delete-user",
        "/api/auth/error",
        "/api/auth/get-session",
        "/api/auth/sign-in/social",
        "/api/auth/sign-out",
      ],
    );
  });

  it("documents the session and user that get-session returns", async () => {
    const document = await openApiDocument();

    const session = getSessionSchema(document);
    assert.ok(
      resolve(document, session.properties.session.$ref).properties.token,
    );
    assert.ok(resolve(document, session.properties.user.$ref).properties.email);
  });

  it("describes the auth routes in OpenAPI 3.0, as the rest of the document is", async () => {
    const document = await openApiDocument();

    const session = getSessionSchema(document);
    assert.equal(session.type, "object");
    assert.equal(session.nullable, true);

    const openApi31Keywords: string[] = [];
    const walk = (value: unknown, pointer: string) => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "propertyNames" || (key === "type" && Array.isArray(entry)))
          openApi31Keywords.push(`${pointer}/${key}`);
        walk(entry, `${pointer}/${key}`);
      }
    };
    walk(document, "#");
    assert.deepEqual(openApi31Keywords, []);
  });

  it("documents that /api/me needs the session cookie", async () => {
    const document = await openApiDocument();

    const [requirement] = document.paths["/api/me"].get.security;
    assert.deepEqual(Object.keys(requirement), ["session"]);
    assert.deepEqual(document.components.securitySchemes.session, {
      type: "apiKey",
      in: "cookie",
      name: "__Secure-better-auth.session_token",
    });
  });

  it("documents that deleting an account needs the session cookie", async () => {
    const { paths } = await openApiDocument();

    assert.deepEqual(paths["/api/auth/delete-user"].post.security, [
      { session: [] },
    ]);
  });

  it("documents that get-session takes the session cookie if there is one", async () => {
    const { paths } = await openApiDocument();

    assert.deepEqual(paths["/api/auth/get-session"].get.security, [
      {},
      { session: [] },
    ]);
  });

  it("names only security schemes it declares", async () => {
    const document = await openApiDocument();

    const named = Object.values(document.paths)
      .flatMap((item) => Object.values(item as object))
      .flatMap((operation) => operation.security ?? [])
      .flatMap((requirement: object) => Object.keys(requirement));
    assert.deepEqual(
      [...new Set(named)],
      Object.keys(document.components.securitySchemes),
    );
  });

  it("serves a browsable docs page", async () => {
    const app = buildSut(createMocks());

    const response = await app.inject({ method: "GET", url: "/api/docs" });
    await app.close();

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/html/);
  });
});
