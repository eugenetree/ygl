import { HOME_HEADING, HOME_SUBHEADING, realExamples } from "@/lib/metadata";
import { PREVIEW_SIZE, previewImage } from "@/lib/preview-image";
import { getSearchPage } from "@/lib/search.server";

export const size = PREVIEW_SIZE;
export const contentType = "image/png";
export const alt =
  "A phrase and how many real YouTube clips say it, on saythis";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
