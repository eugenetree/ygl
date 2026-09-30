import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { InjectOptions } from "fastify";
import { Failure, Success } from "../../types/index.js";
import type { Logger } from "../_common/logger/logger.js";
import type { FindCaptionsUseCase } from "../captions-search/find-captions.use-case.js";
import { SearchController } from "./controllers/search.controller.js";
import type { HttpController } from "./http-controller.js";
import { buildHttpServer } from "./http-server.js";

const FRONTEND_ORIGIN = "https://saythis.cc";

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

// ---- Factory ----------------------------------------------------------------

function createMocks(
  execute: FindCaptionsUseCase["execute"] = async () => found(),
) {
  const logger = {
    setContext: mock.fn(),
    info: mock.fn((_message: string) => {}),
    warn: mock.fn(),
    error: mock.fn((_entry: { message?: string; error?: unknown }) => {}),
  };
  return {
    logger: { ...logger, child: () => logger },
    findCaptionsUseCase: { execute: mock.fn(execute) },
  };
}

function buildSut(
  mocks: ReturnType<typeof createMocks>,
  controllers: HttpController[] = [
    new SearchController(
      mocks.findCaptionsUseCase as unknown as FindCaptionsUseCase,
    ),
  ],
) {
  return buildHttpServer({
    logger: mocks.logger as unknown as Logger,
    frontendOrigin: FRONTEND_ORIGIN,
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
  const CADDY_ADDRESS = "172.18.0.9";

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
    const line = await loggedLine(CADDY_ADDRESS, "203.0.113.7");

    assert.match(line, / 203\.0\.113\.7$/);
  });

  it("trusts only the proxy's own entry in X-Forwarded-For", async () => {
    const line = await loggedLine(CADDY_ADDRESS, "198.51.100.1, 203.0.113.7");

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
      remoteAddress: CADDY_ADDRESS,
      headers: { "x-forwarded-proto": "https" },
    });
    await app.close();

    assert.equal(response.body, "https");
  });
});

describe("API docs", () => {
  it("serves an OpenAPI document listing the search route with its query, response and error codes", async () => {
    const app = buildSut(createMocks());

    const response = await app.inject({ method: "GET", url: "/api/docs/json" });
    await app.close();

    assert.equal(response.statusCode, 200);
    const document = response.json();
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

  it("serves a browsable docs page", async () => {
    const app = buildSut(createMocks());

    const response = await app.inject({ method: "GET", url: "/api/docs" });
    await app.close();

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/html/);
  });
});
