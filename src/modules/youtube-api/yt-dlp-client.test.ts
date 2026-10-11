import "reflect-metadata";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, mock } from "node:test";
import { Logger } from "../_common/logger/logger.js";
import {
  classifyUnprocessable,
  YtDlpClient,
  type YtDlpProcess,
  type YtDlpSpawn,
} from "./yt-dlp-client.js";

const testLogger = () => new Logger({ context: "test", category: "test" });

/** A yt-dlp process that writes `stdout` and `stderr`, then exits with `exitCode`. */
function fakeProcess({
  stdout = "",
  stderr = "",
  exitCode = 0,
}: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}): YtDlpProcess {
  return {
    lines: (async function* () {
      yield* stdout.split("\n");
    })(),
    exited: Promise.resolve({ exitCode, stderr }),
    kill: () => {},
  };
}

/** A spawn that records what yt-dlp would be invoked with and answers `respond`. */
function recordingSpawn(respond: () => { stdout: string }) {
  const calls: string[][] = [];
  const spawn: YtDlpSpawn = (args) => {
    calls.push(args);
    return fakeProcess(respond());
  };
  return { spawn, calls };
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

  it("classifies age-restricted videos reported to a signed-in session", () => {
    const result = classifyUnprocessable(
      "ERROR: [youtube] GELmGHJlQ6o: Sorry, this content is age-restricted\n",
    );

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
      const { spawn, calls } = recordingSpawn(() => ({
        stdout: '{"id":"abc"}\n',
      }));
      const client = new YtDlpClient(testLogger(), spawn);

      const result = await client.execJson([
        "https://youtube.com/watch?v=abc",
        "--dump-json",
      ]);

      assert.deepEqual(result, { ok: true, value: [{ id: "abc" }] });
      assert.deepEqual(calls[0]?.slice(-2), [
        "--",
        "https://youtube.com/watch?v=abc",
      ]);
      const args = calls[0]?.join(" ") ?? "";
      assert.match(
        args,
        /--extractor-args youtubepot-bgutilhttp:base_url=http:\/\/127\.0\.0\.1:4416/,
      );
      assert.match(args, /--dump-json/);
    }));

  it("paces every run so the scraper stays under YouTube's request rate limit", async () => {
    const { spawn, calls } = recordingSpawn(() => ({ stdout: "" }));
    const client = new YtDlpClient(testLogger(), spawn);

    await client.execJson(["https://youtube.com/watch?v=abc", "--dump-json"]);

    const args = calls[0]?.join(" ") ?? "";
    assert.match(args, /--sleep-requests 0\.75/);
    assert.match(args, /--sleep-subtitles 5/);
  });

  it("runs yt-dlp with node as its JS runtime, quiet, with progress on separate lines", async () => {
    const { spawn, calls } = recordingSpawn(() => ({ stdout: "" }));
    const client = new YtDlpClient(testLogger(), spawn);

    await client.execJson(["https://youtube.com/watch?v=abc", "--dump-json"]);

    const args = calls[0]?.join(" ") ?? "";
    assert.match(args, /--js-runtime node/);
    assert.match(args, /--quiet/);
    assert.match(args, /--progress --newline/);
  });

  it("fails a run that logs an ERROR line even though yt-dlp exits 0", async () => {
    const stderr = "ERROR: [youtube:tab] UCabc: Unable to download API page\n";
    const spawn: YtDlpSpawn = () =>
      fakeProcess({ stdout: '{"id":"abc"}\n', stderr });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson([
      "https://youtube.com/watch?v=abc",
      "--dump-json",
    ]);

    assert.deepEqual(result, {
      ok: false,
      error: { type: "YT_DLP_ERROR", message: stderr, cause: undefined },
    });
  });

  it("runs yt-dlp without a PO token provider when YTDLP_POT_PROVIDER_URL is empty", () =>
    withEnv({ YTDLP_POT_PROVIDER_URL: "" }, async () => {
      const { spawn, calls } = recordingSpawn(() => ({ stdout: "" }));
      const client = new YtDlpClient(testLogger(), spawn);

      await client.execJson(["https://youtube.com/watch?v=abc", "--dump-json"]);

      const args = calls[0]?.join(" ") ?? "";
      assert.doesNotMatch(args, /youtubepot/);
    }));

  it("logs yt-dlp's warnings when the run succeeds with stderr output", async () => {
    const stderr =
      "WARNING: [youtube] abc: Some web client https formats have been skipped\n";
    const spawn: YtDlpSpawn = () =>
      fakeProcess({ stdout: '{"id":"abc"}\n', stderr });
    const logger = testLogger();
    const warn = mock.method(logger, "warn", () => {});
    const client = new YtDlpClient(logger, spawn);

    const result = await client.execJson([
      "https://youtube.com/watch?v=abc",
      "--dump-json",
    ]);

    assert.deepEqual(result, { ok: true, value: [{ id: "abc" }] });
    assert.equal(warn.mock.callCount(), 1);
    const logged = String(warn.mock.calls[0]?.arguments[0]);
    assert.match(logged, /Some web client https formats have been skipped/);
    assert.match(logged, /yt-dlp .*--dump-json/);
  });

  it("names YouTube's bot challenge and keeps the full stderr", async () => {
    // Captured from prod (yt-dlp 2026.08.19, VPN exit flagged by YouTube).
    const stderr = [
      "WARNING: [youtube] lq4fz7WhjF4: No PO Token provider available",
      "ERROR: [youtube] lq4fz7WhjF4: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
    ].join("\n");
    const spawn: YtDlpSpawn = () => fakeProcess({ exitCode: 1, stderr });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson([
      "https://youtube.com/watch?v=lq4fz7WhjF4",
      "--dump-json",
    ]);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "YT_DLP_ERROR");
    assert.match(result.error.message, /^YouTube bot challenge/);
    assert.ok(result.error.message.endsWith(stderr), "full stderr kept");
  });
});

const BARE_UNAVAILABLE_STDERR =
  "ERROR: [youtube] GOBE0yqiMHo: Video unavailable\n";

const EMBEDDING_DISABLED_PAGE = JSON.stringify({
  playabilityStatus: {
    status: "UNPLAYABLE",
    reason: "Video unavailable",
    errorScreen: {
      playerInterstitialRenderer: {
        content: {
          interstitialViewModel: {
            title: { content: "Video unavailable" },
            description: {
              content:
                "Playback on other websites has been disabled by the video owner",
            },
          },
        },
      },
    },
  },
});

function pageWritingSpawn(stderr: string, pages: Record<string, string>) {
  const calls: string[][] = [];
  const cwds: (string | undefined)[] = [];
  const spawn: YtDlpSpawn = (args, options) => {
    calls.push(args);
    cwds.push(options?.cwd);
    if (options?.cwd) {
      for (const [name, content] of Object.entries(pages)) {
        fs.writeFileSync(path.join(options.cwd, name), content);
      }
    }
    return fakeProcess({ exitCode: 1, stderr });
  };
  return { spawn, calls, cwds };
}

describe("YtDlpClient.execJson() diagnosing an unavailable video", () => {
  it("skips a video whose owner disabled playback on other websites", async () => {
    const { spawn } = pageWritingSpawn(BARE_UNAVAILABLE_STDERR, {
      "GOBE0yqiMHo_5ba6_https_-_www.youtube.com_youtubei_v1_playerprettyPrint=false.dump":
        EMBEDDING_DISABLED_PAGE,
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson(
      ["https://youtube.com/watch?v=GOBE0yqiMHo", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "EMBEDDING_DISABLED_VIDEO");
    assert.match(result.error.message, /Video unavailable/);
    assert.match(
      result.error.message,
      /Playback on other websites has been disabled by the video owner/,
    );
  });

  it("keeps a bare unavailable a failure when YouTube's responses don't say why", async () => {
    const { spawn } = pageWritingSpawn(BARE_UNAVAILABLE_STDERR, {
      "GOBE0yqiMHo_watch.dump": '{"playabilityStatus":{"status":"OK"}}',
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson(
      ["https://youtube.com/watch?v=GOBE0yqiMHo", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.deepEqual(result, {
      ok: false,
      error: {
        type: "YT_DLP_ERROR",
        message: BARE_UNAVAILABLE_STDERR,
        cause: undefined,
      },
    });
  });

  it("looks for a reason only behind a bare unavailable, not behind a bot challenge", async () => {
    const stderr =
      "ERROR: [youtube] GOBE0yqiMHo: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.\n";
    const { spawn } = pageWritingSpawn(stderr, {
      "GOBE0yqiMHo_player.dump": EMBEDDING_DISABLED_PAGE,
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson(
      ["https://youtube.com/watch?v=GOBE0yqiMHo", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "YT_DLP_ERROR");
    assert.match(result.error.message, /^YouTube bot challenge/);
  });

  it("keeps a bot challenge a failure when a bare unavailable follows it", async () => {
    const stderr = [
      "WARNING: [youtube] GOBE0yqiMHo: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
      BARE_UNAVAILABLE_STDERR,
    ].join("\n");
    const { spawn } = pageWritingSpawn(stderr, {
      "GOBE0yqiMHo_player.dump": EMBEDDING_DISABLED_PAGE,
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson(
      ["https://youtube.com/watch?v=GOBE0yqiMHo", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "YT_DLP_ERROR");
    assert.match(result.error.message, /^YouTube bot challenge/);
  });

  it("runs yt-dlp with --write-pages in a folder it removes afterwards", async () => {
    const { spawn, calls, cwds } = pageWritingSpawn(BARE_UNAVAILABLE_STDERR, {
      "GOBE0yqiMHo_player.dump": EMBEDDING_DISABLED_PAGE,
    });
    const client = new YtDlpClient(testLogger(), spawn);

    await client.execJson(
      ["https://youtube.com/watch?v=GOBE0yqiMHo", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.match(calls[0]?.join(" ") ?? "", /--write-pages/);
    const cwd = cwds[0];
    assert.ok(cwd, "ran in a folder of its own");
    assert.equal(fs.existsSync(cwd), false, "folder removed");
  });

  it("removes the folder after a successful run too", async () => {
    const cwds: (string | undefined)[] = [];
    const spawn: YtDlpSpawn = (_args, options) => {
      cwds.push(options?.cwd);
      return fakeProcess({ stdout: '{"id":"GG3qo-O8VJE"}\n' });
    };
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson(
      ["https://youtube.com/watch?v=GG3qo-O8VJE", "--dump-json"],
      { diagnoseUnavailable: true },
    );

    assert.deepEqual(result, { ok: true, value: [{ id: "GG3qo-O8VJE" }] });
    assert.ok(cwds[0]);
    assert.equal(fs.existsSync(cwds[0]), false);
  });

  it("leaves runs that don't ask for a diagnosis as they were", async () => {
    const { spawn, calls, cwds } = pageWritingSpawn(BARE_UNAVAILABLE_STDERR, {
      "GOBE0yqiMHo_player.dump": EMBEDDING_DISABLED_PAGE,
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const result = await client.execJson([
      "https://youtube.com/watch?v=GOBE0yqiMHo",
      "--dump-json",
    ]);

    assert.doesNotMatch(calls[0]?.join(" ") ?? "", /--write-pages/);
    assert.equal(cwds[0], undefined);
    assert.equal(result.ok ? undefined : result.error.type, "YT_DLP_ERROR");
  });
});

describe("YtDlpClient.exec()", () => {
  it("keeps skip causes as skip causes and names the bot challenge", async () => {
    const failingWith =
      (stderr: string): YtDlpSpawn =>
      () =>
        fakeProcess({ exitCode: 1, stderr });

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

describe("YtDlpClient.execJsonStream()", () => {
  async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const result of stream) results.push(result);
    return results;
  }

  it("yields each JSON line yt-dlp writes", async () => {
    const { spawn, calls } = recordingSpawn(() => ({
      stdout: '{"id":"a"}\n{"id":"b"}\n',
    }));
    const client = new YtDlpClient(testLogger(), spawn);

    const results = await drain(
      client.execJsonStream([
        "https://www.youtube.com/channel/UCabc/videos",
        "--flat-playlist",
      ]),
    );

    assert.deepEqual(results, [
      { ok: true, value: { id: "a" } },
      { ok: true, value: { id: "b" } },
    ]);
    assert.deepEqual(calls[0]?.slice(-3), [
      "--flat-playlist",
      "--",
      "https://www.youtube.com/channel/UCabc/videos",
    ]);
  });

  it("ends with a failure carrying the full stderr when yt-dlp exits non-zero", async () => {
    const stderr = [
      "WARNING: [youtube:tab] Incomplete data received",
      "ERROR: [youtube:tab] UCabc: This channel does not have a videos tab",
    ].join("\n");
    const spawn: YtDlpSpawn = () =>
      fakeProcess({ stdout: '{"id":"a"}\n', stderr, exitCode: 1 });
    const client = new YtDlpClient(testLogger(), spawn);

    const results = await drain(
      client.execJsonStream(["https://www.youtube.com/channel/UCabc/videos"]),
    );

    assert.deepEqual(results, [
      { ok: true, value: { id: "a" } },
      {
        ok: false,
        error: { type: "YT_DLP_ERROR", message: stderr, cause: undefined },
      },
    ]);
  });

  it("ends with a failure when yt-dlp logs an ERROR line but exits 0", async () => {
    const stderr = "ERROR: [youtube:tab] UCabc: Unable to download API page\n";
    const spawn: YtDlpSpawn = () => fakeProcess({ stderr });
    const client = new YtDlpClient(testLogger(), spawn);

    const results = await drain(
      client.execJsonStream(["https://www.youtube.com/channel/UCabc/videos"]),
    );

    assert.deepEqual(results, [
      {
        ok: false,
        error: { type: "YT_DLP_ERROR", message: stderr, cause: undefined },
      },
    ]);
  });

  function killCountingSpawn(stdout: string) {
    const counter = { kills: 0 };
    const spawn: YtDlpSpawn = () => ({
      ...fakeProcess({ stdout }),
      kill: () => {
        counter.kills++;
      },
    });
    return { spawn, counter };
  }

  it("stops yt-dlp when the consumer stops reading early", async () => {
    const { spawn, counter } = killCountingSpawn('{"id":"a"}\n{"id":"b"}\n');
    const client = new YtDlpClient(testLogger(), spawn);

    for await (const _ of client.execJsonStream([
      "https://www.youtube.com/channel/UCabc/videos",
    ])) {
      break;
    }

    assert.equal(counter.kills, 1);
  });

  it("leaves yt-dlp alone once it has run to completion", async () => {
    const { spawn, counter } = killCountingSpawn('{"id":"a"}\n');
    const client = new YtDlpClient(testLogger(), spawn);

    await drain(
      client.execJsonStream(["https://www.youtube.com/channel/UCabc/videos"]),
    );

    assert.equal(counter.kills, 0);
  });

  it("fails when yt-dlp cannot be started", async () => {
    const notFound = new Error("spawn yt-dlp ENOENT");
    const spawn: YtDlpSpawn = () => ({
      lines: (async function* () {})(),
      exited: Promise.reject(notFound),
      kill: () => {},
    });
    const client = new YtDlpClient(testLogger(), spawn);

    const results = await drain(
      client.execJsonStream(["https://www.youtube.com/channel/UCabc/videos"]),
    );

    assert.deepEqual(results, [
      {
        ok: false,
        error: {
          type: "YT_DLP_ERROR",
          message: "spawn yt-dlp ENOENT",
          cause: { originalError: notFound },
        },
      },
    ]);
  });
});
