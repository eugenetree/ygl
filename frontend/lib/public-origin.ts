import "server-only";

/** The origin people reach the site on, for canonical and preview URLs. */
export function publicOrigin(): URL {
  const origin =
    process.env.PUBLIC_ORIGIN ??
    // The build prerenders pages with the root metadata, and has no env.
    (process.env.NODE_ENV === "development" ||
    process.env.NEXT_PHASE === "phase-production-build"
      ? "http://localhost:3000"
      : undefined);
  // Read per call, not at import, so a running server sees its own env.
  if (!origin) throw new Error("PUBLIC_ORIGIN is not set");
  return new URL(origin);
}
