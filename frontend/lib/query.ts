// The API rejects longer queries.
export const MAX_QUERY_LENGTH = 200;

/** A `/say/{segment}` path's segment, which Next leaves percent-encoded. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
