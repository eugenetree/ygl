import { ChannelPriorityListing } from "../scraping/channel-priority/get-channel-priorities.use-case.js";

export type FormatChannelPrioritiesOptions = {
  onlyActive: boolean;
};

/**
 * Renders the priority listing as Telegram HTML.
 *
 * Every bucket is shown even when zero, so the five numbers sit in the same
 * position on every row and a drained channel is distinguishable at a glance
 * from one that still has work.
 */
export function formatChannelPriorities(
  listings: ChannelPriorityListing[],
  options: FormatChannelPrioritiesOptions,
): string {
  if (listings.length === 0) {
    return options.onlyActive
      ? "No channels with videos left to process."
      : "No channels yet.";
  }

  const header = options.onlyActive
    ? `Top ${listings.length} channels with videos left to process:`
    : `Top ${listings.length} channels by priority:`;

  const rows = listings.map((listing, index) => {
    const url = `https://www.youtube.com/channel/${listing.channelId}`;
    const name = escapeHtml(listing.name);
    const boost = listing.isBoosted ? " ⬆ boosted" : "";
    const score = Math.round(listing.scrapingScore);

    const counts = [
      `${listing.total} total`,
      `${listing.processed} ok`,
      `${listing.left} left`,
      `${listing.failed} fail`,
      `${listing.skipped} skip`,
    ].join(" · ");

    return (
      `${index + 1}. <a href="${url}">${name}</a> — ${score}${boost}\n` +
      `   ${counts}`
    );
  });

  return `${header}\n\n${rows.join("\n\n")}`;
}

/** Telegram's HTML parse mode requires these three to be entity-escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
