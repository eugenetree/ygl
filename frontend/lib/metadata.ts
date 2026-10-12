import type { SearchResponse } from "@api/contract";
import type { Metadata } from "next";
import { formatTotal } from "@/lib/clip-batch";
import { PREVIEW_SIZE } from "@/lib/preview-image";
import type { SearchPage } from "@/lib/search.server";

export const HOME_HEADING = "Hear how it's actually said.";
export const HOME_SUBHEADING =
  "Search YouTube captions and jump straight to the moment.";

const SITE_OPEN_GRAPH = {
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

export function searchMetadata(page: SearchPage): Metadata {
  switch (page.status) {
    case "too-long":
      return { title: "This search is too long", robots: { index: false } };
    case "no-clips": {
      const title = `No clips for “${page.query}”`;
      const description = `No YouTube clips say “${page.query}” yet.`;
      // A segment with no words names no search to point at.
      const { slug } = page;
      return {
        title,
        description,
        openGraph: {
          ...SITE_OPEN_GRAPH,
          title,
          description,
          images: slug ? previewImageOf(slug) : undefined,
        },
        robots: { index: false },
        alternates: slug ? { canonical: `/say/${slug}` } : undefined,
      };
    }
    case "clips": {
      const { total, isTotalExact } = page.firstBatch;
      const title = `How to pronounce “${page.query}”: ${realExamples(page.firstBatch)}`;
      const clips =
        total === 1
          ? "1 real YouTube clip, starting"
          : `${formatTotal(total, isTotalExact)} real YouTube clips, each starting`;
      const description = `Hear “${page.query}” said in ${clips} right where it's said.`;
      const url = `/say/${page.slug}`;
      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
          ...SITE_OPEN_GRAPH,
          title,
          description,
          url,
          images: previewImageOf(page.slug),
        },
      };
    }
  }
}

/** A search's preview image, at its canonical slug. */
function previewImageOf(slug: string) {
  return {
    url: `/say/${slug}/preview-image`,
    ...PREVIEW_SIZE,
    type: "image/png",
    alt: "A phrase and how many real YouTube clips say it, on saythis",
  };
}

/** The count in a search's title, and its preview image's count line. */
export function realExamples({ total, isTotalExact }: SearchResponse): string {
  return `${formatTotal(total, isTotalExact)} real ${total === 1 ? "example" : "examples"}`;
}
