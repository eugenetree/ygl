import "server-only";

/** Where the server reaches the API. The browser uses relative /api paths. */
export function apiUrl(): string {
  const url =
    process.env.API_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : undefined);
  // Read per call, not at import, so the Docker build needs no API_URL.
  if (!url) throw new Error("API_URL is not set");
  return url;
}
