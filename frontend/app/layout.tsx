import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ThemeScript } from "@/components/theme-script";
import { siteMetadata } from "@/lib/metadata";
import { publicOrigin } from "@/lib/public-origin";
import "./globals.css";

// A function, not a const, so pages rendered per request read the runtime
// PUBLIC_ORIGIN rather than the build's.
export function generateMetadata(): Metadata {
  return siteMetadata(publicOrigin());
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      // The theme script adds `dark` before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
