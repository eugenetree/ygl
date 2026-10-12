import { ImageResponse } from "next/og";
import { geistFonts } from "@/lib/preview-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// The logo's brackets around its first letter. Light on dark, so it shows on
// both light and dark browser tabs.
export default async function Icon() {
  const bracket = { fontWeight: 500 };
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        borderRadius: 7,
        background: "#18181b",
        color: "#fafafa",
        fontFamily: "Geist",
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        paddingBottom: 2,
      }}
    >
      <span style={bracket}>[</span>s<span style={bracket}>]</span>
    </div>,
    { ...size, fonts: await geistFonts },
  );
}
