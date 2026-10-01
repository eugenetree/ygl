import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { LightMyRequestResponse } from "fastify";
import { sql } from "kysely";
import { useTestDatabase } from "../../db/testing/test-database.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import {
  createTestAuth,
  TEST_AUTH_SETTINGS,
} from "../auth/testing/test-auth.js";
import { MeController } from "./controllers/me.controller.js";
import type { HttpApp } from "./http-controller.js";
import { buildHttpServer } from "./http-server.js";

const PUBLIC_ORIGIN = TEST_AUTH_SETTINGS.publicOrigin;

const googleProfile = {
  sub: "108234567890123456789",
  email: "ada@example.com",
  email_verified: true,
  name: "Ada Lovelace",
  picture: "https://lh3.googleusercontent.com/a/ada",
};

// ---- Fake Google ------------------------------------------------------------

// Google's token endpoint is the one network call in the OAuth round trip. The
// callback reads the profile from the id token without verifying its signature.
function fakeGoogleTokenEndpoint() {
  const idToken = [{ alg: "RS256", typ: "JWT" }, googleProfile, "signature"]
    .map((part) =>
      Buffer.from(
        typeof part === "string" ? part : JSON.stringify(part),
      ).toString("base64url"),
    )
    .join(".");
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== "https://oauth2.googleapis.com/token") {
      throw new Error(`Unexpected request to ${url}`);
    }
    return Response.json({
      access_token: "google-access-token",
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
    });
  });
}

// ---- SUT factory ------------------------------------------------------------

function buildSut(db: ReturnType<typeof useTestDatabase>) {
  return buildHttpServer({
    logger: createLoggerMock() as unknown as Logger,
    auth: createTestAuth(db),
    controllers: [new MeController()],
  });
}

// ---- Browser ----------------------------------------------------------------

class Browser {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly app: HttpApp) {}

  async signInWithGoogle() {
    const start = await this.post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: `${PUBLIC_ORIGIN}/`,
    });
    assert.equal(start.statusCode, 200, start.body);
    const state = new URL(start.json().url).searchParams.get("state");

    const callback = await this.get(
      `/api/auth/callback/google?code=google-code&state=${state}`,
    );
    assert.equal(callback.statusCode, 302, callback.body);
    assert.equal(callback.headers.location, `${PUBLIC_ORIGIN}/`);
  }

  deleteAccount() {
    return this.post("/api/auth/delete-user", {});
  }

  hasSessionCookie() {
    return this.cookies.has("__Secure-better-auth.session_token");
  }

  me() {
    return this.get("/api/me");
  }

  private get(url: string) {
    return this.send({ method: "GET", url });
  }

  private post(url: string, payload: object) {
    return this.send({ method: "POST", url, payload });
  }

  private async send(request: {
    method: "GET" | "POST";
    url: string;
    payload?: object;
  }) {
    const response = await this.app.inject({
      ...request,
      headers: {
        origin: PUBLIC_ORIGIN,
        cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
    });
    this.keepCookies(response);
    return response;
  }

  private keepCookies(response: LightMyRequestResponse) {
    for (const cookie of response.cookies as {
      name: string;
      value: string;
      maxAge?: number;
    }[]) {
      if (cookie.maxAge === 0 || cookie.value === "") {
        this.cookies.delete(cookie.name);
      } else {
        this.cookies.set(cookie.name, cookie.value);
      }
    }
  }
}

// ---- Tests ------------------------------------------------------------------

describe("Deleting an account", () => {
  const db = useTestDatabase();
  let app: HttpApp;

  // The auth tables are better-auth's, so they are not in our Database type.
  async function rowsIn(table: "users" | "sessions" | "accounts") {
    const { rows } = await sql`SELECT * FROM ${sql.table(table)}`.execute(db);
    return rows;
  }

  beforeEach(() => {
    fakeGoogleTokenEndpoint();
    app = buildSut(db);
  });

  afterEach(async () => {
    await app.close();
    mock.restoreAll();
  });

  it("removes the user, their sessions and their Google account link", async () => {
    const laptop = new Browser(app);
    const phone = new Browser(app);
    await laptop.signInWithGoogle();
    await phone.signInWithGoogle();

    const response = await laptop.deleteAccount();

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(await rowsIn("users"), []);
    assert.deepEqual(await rowsIn("sessions"), []);
    assert.deepEqual(await rowsIn("accounts"), []);
  });

  it("signs the listener out on every device", async () => {
    const laptop = new Browser(app);
    const phone = new Browser(app);
    await laptop.signInWithGoogle();
    await phone.signInWithGoogle();

    await laptop.deleteAccount();

    assert.equal(laptop.hasSessionCookie(), false);
    assert.equal((await phone.me()).statusCode, 401);
  });

  it("creates a new user when the same Google account signs in again", async () => {
    const browser = new Browser(app);
    await browser.signInWithGoogle();
    const before = (await browser.me()).json();
    await browser.deleteAccount();

    await browser.signInWithGoogle();

    const after = (await browser.me()).json();
    assert.equal(after.email, "ada@example.com");
    assert.notEqual(after.id, before.id);
  });
});
