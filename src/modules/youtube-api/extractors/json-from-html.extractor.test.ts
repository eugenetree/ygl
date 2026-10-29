import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Success } from "../../../types/index.js";
import { jsonFromHtmlExtractor } from "./json-from-html.extractor.js";

describe("jsonFromHtmlExtractor.getInitialData", () => {
  it("reads the initial data from the yt-initial-data JSON script", () => {
    const html =
      `<html><head></head><body>` +
      `<script id="yt-initial-data" type="application/json" nonce="abc">{"metadata":{"channelMetadataRenderer":{"title":"SciShow Kids"}}}</script>` +
      `<script nonce="abc">if (window.ytcsi) {window.ytcsi.tick('pdr', null, '');}</script>` +
      `<script nonce="abc">var ytDataEl = document.getElementById('yt-initial-data'); if (ytDataEl) {try {window['ytInitialData'] = JSON.parse(ytDataEl.textContent);} catch (e) {}}</script>` +
      `</body></html>`;

    assert.deepEqual(
      jsonFromHtmlExtractor.getInitialData(html),
      Success({
        metadata: { channelMetadataRenderer: { title: "SciShow Kids" } },
      }),
    );
  });

  it("reads the initial data from the inline ytInitialData script", () => {
    const html =
      `<html><head></head><body>` +
      `<script nonce="abc">var ytInitialData = {"metadata":{"channelMetadataRenderer":{"title":"TED"}}};</script>` +
      `</body></html>`;

    assert.deepEqual(
      jsonFromHtmlExtractor.getInitialData(html),
      Success({ metadata: { channelMetadataRenderer: { title: "TED" } } }),
    );
  });
});
