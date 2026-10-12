import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const PREVIEW_SIZE = { width: 1200, height: 630 };

// The design's light palette, from globals.css.
const COLORS = {
  background: "#fafafa",
  foreground: "#09090b",
  muted: "#71717a",
  primary: "#18181b",
};

// Satori can't read woff2, so these TTFs are copied from the geist package.
// process.cwd() is also where the standalone server traces them to.
const FONT_FILES = { 500: "Medium", 700: "Bold" } as const;

export const geistFonts = Promise.all(
  ([500, 700] as const).map(async (weight) => ({
    name: "Geist",
    data: await readFile(
      join(process.cwd(), `assets/Geist-${FONT_FILES[weight]}.ttf`),
    ),
    weight,
    style: "normal" as const,
  })),
);

/** A shared link's image: the `[saythis]` logo above a heading and a line. */
export async function previewImage({
  heading,
  line,
}: {
  heading: string;
  line: string;
}): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 80,
        background: COLORS.background,
        color: COLORS.foreground,
        fontFamily: "Geist",
      }}
    >
      <PreviewLogo size={44} />
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Words
          text={heading}
          fontSize={headingSize(heading)}
          style={{
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
          }}
        />
        <Words
          text={line}
          fontSize={36}
          style={{ fontWeight: 500, color: COLORS.muted }}
        />
      </div>
    </div>,
    { ...PREVIEW_SIZE, fonts: await geistFonts },
  );
}

/** The site's Brackets logo, drawn for Satori. */
export function PreviewLogo({ size }: { size: number }) {
  const bracket = { color: COLORS.primary, fontWeight: 500 };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.08,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      <span style={bracket}>[</span>
      saythis
      <span style={bracket}>]</span>
    </div>
  );
}

// Satori draws some Geist words narrower than it measures them, which leaves
// wide gaps after them (e.g. "YouTube  captions"). Drawn one letter at a time
// they match, so each word is a row of letters and the gap stands in for the
// space.
function Words({
  text,
  fontSize,
  style,
}: {
  text: string;
  fontSize: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={{
        ...style,
        display: "flex",
        flexWrap: "wrap",
        columnGap: fontSize * 0.25,
        fontSize,
      }}
    >
      {text.split(/\s+/).map((word, wordIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: words repeat, and the list never changes.
        <div key={wordIndex} style={{ display: "flex", flexWrap: "wrap" }}>
          {Array.from(word, (letter, letterIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <span key={letterIndex}>{letter}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// Shrinks long phrases so even the longest search fits in four lines.
function headingSize(heading: string): number {
  if (heading.length <= 24) return 112;
  if (heading.length <= 48) return 88;
  if (heading.length <= 96) return 64;
  return 46;
}
