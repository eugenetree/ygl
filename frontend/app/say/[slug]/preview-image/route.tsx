import { HOME_HEADING, HOME_SUBHEADING, realExamples } from "@/lib/metadata";
import { previewImage } from "@/lib/preview-image";
import { getSearchPage } from "@/lib/search.server";

// Not an opengraph-image file: Next would point a non-canonical path's
// og:image at that path, and metadata can't override a file's image.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/say/[slug]/preview-image">,
) {
  const { slug } = await params;
  const page = await getSearchPage(slug);

  switch (page.status) {
    case "too-long":
      return previewImage({ heading: HOME_HEADING, line: HOME_SUBHEADING });
    case "no-clips":
      return previewImage({ heading: `“${page.query}”`, line: "No clips yet" });
    case "clips":
      return previewImage({
        heading: `“${page.query}”`,
        line: realExamples(page.firstBatch),
      });
  }
}
