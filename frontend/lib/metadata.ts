import type { Metadata } from "next";

export const HOME_HEADING = "Hear how it's actually said.";
export const HOME_SUBHEADING =
  "Search YouTube captions and jump straight to the moment.";

export const SITE_OPEN_GRAPH = {
  type: "website",
  siteName: "saythis",
  locale: "en_US",
} as const;

/** The whole site's defaults, which are also home's metadata. */
export function siteMetadata(origin: URL): Metadata {
  return {
    metadataBase: origin,
    title: {
      default: "Hear how it's actually said · saythis",
      template: "%s · saythis",
    },
    description: HOME_SUBHEADING,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title: HOME_HEADING,
      description: HOME_SUBHEADING,
    },
    twitter: { card: "summary_large_image" },
  };
}
