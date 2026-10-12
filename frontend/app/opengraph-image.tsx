import { HOME_HEADING, HOME_SUBHEADING } from "@/lib/metadata";
import { PREVIEW_SIZE, previewImage } from "@/lib/preview-image";

export const size = PREVIEW_SIZE;
export const contentType = "image/png";
export const alt = "saythis: Hear how it's actually said.";

export default function Image() {
  return previewImage({ heading: HOME_HEADING, line: HOME_SUBHEADING });
}
