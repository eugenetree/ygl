import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelPriorityListing } from "../scraping/channel-priority/get-channel-priorities.use-case.js";
import { formatChannelPriorities } from "./channel-priorities.formatter.js";

function listing(
  overrides: Partial<ChannelPriorityListing> = {},
): ChannelPriorityListing {
  return {
    channelId: "UCHnyfMqiRRG1u2MsSQLbXA",
    name: "Veritasium",
    scrapingScore: 1183,
    isBoosted: false,
    total: 1000,
    processed: 500,
    left: 400,
    failed: 50,
    skipped: 50,
    ...overrides,
  };
}

describe("formatChannelPriorities", () => {
  it("renders a linked channel name, its score and all five counts", () => {
    const message = formatChannelPriorities([listing()], {
      onlyActive: false,
    });

    assert.match(
      message,
      /1\. <a href="https:\/\/www\.youtube\.com\/channel\/UCHnyfMqiRRG1u2MsSQLbXA">Veritasium<\/a> — 1183/,
    );
    assert.match(message, /1000 total · 500 ok · 400 left · 50 fail · 50 skip/);
  });

  it("shows zero counts rather than omitting them", () => {
    const message = formatChannelPriorities(
      [listing({ total: 820, processed: 820, left: 0, failed: 0, skipped: 0 })],
      { onlyActive: false },
    );

    assert.match(message, /820 total · 820 ok · 0 left · 0 fail · 0 skip/);
  });

  it("escapes HTML in channel names so the message cannot be broken", () => {
    const message = formatChannelPriorities(
      [listing({ name: "Rock & Roll <Live>" })],
      { onlyActive: false },
    );

    assert.match(message, /Rock &amp; Roll &lt;Live&gt;/);
    assert.doesNotMatch(message, /Rock & Roll/);
  });

  it("marks boosted channels", () => {
    const message = formatChannelPriorities([listing({ isBoosted: true })], {
      onlyActive: false,
    });

    assert.match(message, /— 1183 ⬆ boosted/);
  });

  it("rounds fractional scores", () => {
    const message = formatChannelPriorities(
      [listing({ scrapingScore: 67.8391 })],
      { onlyActive: false },
    );

    assert.match(message, /— 68/);
  });

  it("numbers the channels in the order given", () => {
    const message = formatChannelPriorities(
      [
        listing({ channelId: "UC_a", name: "First" }),
        listing({ channelId: "UC_b", name: "Second" }),
      ],
      { onlyActive: false },
    );

    assert.ok(message.indexOf("1. ") < message.indexOf("2. "));
    assert.match(message, /2\. <a href="[^"]+UC_b">Second<\/a>/);
  });

  it("explains an empty result differently for each command", () => {
    assert.match(
      formatChannelPriorities([], { onlyActive: true }),
      /no channels with videos left to process/i,
    );
    assert.match(
      formatChannelPriorities([], { onlyActive: false }),
      /no channels/i,
    );
  });
});
