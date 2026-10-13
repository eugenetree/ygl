import type { SearchResponse } from "@api/contract";
import type { Metadata } from "next";
import { formatTotal } from "@/app/say/[slug]/_lib/clip-batch";
import type { SearchPage } from "@/app/say/[slug]/_lib/search.server";
import {
  noClipsTitle,
  pronounceHeading,
  TOO_LONG_TITLE,
} from "@/app/say/[slug]/_lib/search-copy";
import { SITE_OPEN_GRAPH } from "@/lib/metadata";
import { PREVIEW_SIZE } from "@/lib/preview-image";

export function searchMetadata(page: SearchPage): Metadata {
  switch (page.status) {
    case "too-long":
      return { title: TOO_LONG_TITLE, robots: { index: false } };
    case "no-clips": {
      const title = noClipsTitle(page.query);
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
      const title = `${pronounceHeading(page.query)}: ${exampleCount(page.firstBatch)}`;
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
export function exampleCount({ total, isTotalExact }: SearchResponse): string {
  return `${formatTotal(total, isTotalExact)} real ${total === 1 ? "example" : "examples"}`;
}
