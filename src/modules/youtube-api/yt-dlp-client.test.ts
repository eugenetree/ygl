import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "../_common/logger/logger.js";
import {
  classifyUnprocessable,
  YtDlpClient,
  type YtDlpRunner,
} from "./yt-dlp-client.js";

const testLogger = () => new Logger({ context: "test", category: "test" });

/** A runner that records what yt-dlp would be invoked with and answers `respond`. */
function recordingRunner(respond: () => Promise<{ stdout: string }>) {
  const calls: { url: string; args: string[] }[] = [];
  const runner: YtDlpRunner = async (url, args) => {
    calls.push({ url, args });
    const { stdout } = await respond();
    return { exitCode: 0, stdout, stderr: "" };
  };
  return { runner, calls };
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]]),
  );
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

describe("classifyUnprocessable()", () => {
  it("classifies members-only videos", () => {
    const result = classifyUnprocessable(
      "Join this channel to get access to members-only content",
    );

    assert.deepEqual(result, {
      type: "MEMBERS_ONLY_VIDEO",
      message: "Join this channel to get access to members-only content",
    });
  });

  it("classifies geo-restricted videos", () => {
    const result = classifyUnprocessable(
      "The uploader has not made this video available in your country",
    );

    assert.equal(result?.type, "GEO_RESTRICTED_VIDEO");
  });

  it("classifies age-restricted videos", () => {
    const result = classifyUnprocessable("Sign in to confirm your age");

    assert.equal(result?.type, "AGE_RESTRICTED_VIDEO");
  });

  it("classifies premiere videos", () => {
    const result = classifyUnprocessable("Premieres in 2 hours");

    assert.equal(result?.type, "PREMIERE_VIDEO");
  });

  it("classifies videos removed by the uploader", () => {
    const message =
      "WE8b6dbG9bE: Video unavailable. This video has been removed by the uploader";

    const result = classifyUnprocessable(message);

    assert.deepEqual(result, {
      type: "REMOVED_BY_UPLOADER_VIDEO",
      message,
    });
  });

  it("classifies videos blocked due to claimed content", () => {
    const message =
      "DGc_-FJnscQ: Video unavailable. It was blocked due to the claimed content by Turner EST.";

    const result = classifyUnprocessable(message);

    assert.deepEqual(result, { type: "CLAIMED_CONTENT_VIDEO", message });
  });

  it("returns null for unrecognized messages", () => {
    const result = classifyUnprocessable("Some unexpected yt-dlp failure");

    assert.equal(result, null);
  });
});

describe("YtDlpClient.execJson()", () => {
  it("runs yt-dlp with the configured PO token provider", () =>
    withEnv({ YTDLP_POT_PROVIDER_URL: "http://127.0.0.1:4416" }, async () => {
      const { runner, calls } = recordingRunner(async () => ({
        stdout: '{"id":"abc"}\n',
      }));
      const client = new YtDlpClient(testLogger(), runner);

      const result = await client.execJson([
        "https://youtube.com/watch?v=abc",
        "--dump-json",
      ]);

      assert.deepEqual(result, { ok: true, value: [{ id: "abc" }] });
      assert.equal(calls[0]?.url, "https://youtube.com/watch?v=abc");
      const args = calls[0]?.args.join(" ") ?? "";
      assert.match(
        args,
        /--extractor-args youtubepot-bgutilhttp:base_url=http:\/\/127\.0\.0\.1:4416/,
      );
      assert.match(args, /--dump-json/);
    }));

  it("runs yt-dlp without a PO token provider when YTDLP_POT_PROVIDER_URL is empty", () =>
    withEnv({ YTDLP_POT_PROVIDER_URL: "" }, async () => {
      const { runner, calls } = recordingRunner(async () => ({
        stdout: "",
      }));
      const client = new YtDlpClient(testLogger(), runner);

      await client.execJson(["https://youtube.com/watch?v=abc", "--dump-json"]);

      const args = calls[0]?.args.join(" ") ?? "";
      assert.doesNotMatch(args, /youtubepot/);
    }));

  it("names YouTube's bot challenge instead of a bare yt-dlp failure", async () => {
    // Captured from prod (yt-dlp 2026.08.19, VPN exit flagged by YouTube).
    // ytdlp-nodejs rejects with only the first ERROR line of stderr.
    const runner: YtDlpRunner = async () => {
      throw new Error(
        "yt-dlp exited with code 1: lq4fz7WhjF4: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
      );
    };
    const client = new YtDlpClient(testLogger(), runner);

    const result = await client.execJson([
      "https://youtube.com/watch?v=lq4fz7WhjF4",
      "--dump-json",
    ]);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "YT_DLP_ERROR");
    assert.match(result.error.message, /^YouTube bot challenge/);
    assert.match(result.error.message, /Sign in to confirm you’re not a bot/);
  });
});

describe("YtDlpClient.exec()", () => {
  it("keeps skip causes as skip causes and names the bot challenge", async () => {
    const failingWith =
      (stderr: string): YtDlpRunner =>
      async () => {
        throw new Error(`yt-dlp exited with code 1: ${stderr}`);
      };

    const membersOnly = await new YtDlpClient(
      testLogger(),
      failingWith(
        "abc: Join this channel to get access to members-only content",
      ),
    ).exec(["https://youtube.com/watch?v=abc", "--write-subs"]);
    assert.equal(membersOnly.ok, false);
    if (!membersOnly.ok)
      assert.equal(membersOnly.error.type, "MEMBERS_ONLY_VIDEO");

    const botChallenge = await new YtDlpClient(
      testLogger(),
      failingWith("abc: Sign in to confirm you’re not a bot. Use --cookies"),
    ).exec(["https://youtube.com/watch?v=abc", "--write-subs"]);
    assert.equal(botChallenge.ok, false);
    if (!botChallenge.ok) {
      assert.equal(botChallenge.error.type, "YT_DLP_ERROR");
      assert.match(botChallenge.error.message, /^YouTube bot challenge/);
    }
  });
});

describe("YtDlpClient.getVersion()", () => {
  it("resolves the real yt-dlp version by invoking the binary", async () => {
    const client = new YtDlpClient(
      new Logger({ context: "test", category: "test" }),
    );

    const version = await client.getVersion();

    assert.ok(version, "expected a version string, got undefined");
    assert.match(version, /^\d{4}\.\d{2}\.\d{2}/);
  });
});
