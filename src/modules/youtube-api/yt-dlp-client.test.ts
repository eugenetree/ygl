import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyUnprocessable } from "./yt-dlp-client.js";

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
