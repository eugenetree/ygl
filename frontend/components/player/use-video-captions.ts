import type { VideoCaptionsResponse } from "@api/contract";
import { useQuery } from "@tanstack/react-query";

async function fetchVideoCaptions(
  videoId: string,
  signal: AbortSignal,
): Promise<VideoCaptionsResponse> {
  const response = await fetch(
    `/api/videos/${encodeURIComponent(videoId)}/captions`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Captions failed with ${response.status}`);
  }
  return response.json();
}

function selectCaptions(data: VideoCaptionsResponse) {
  return data.captions;
}

/** A video's captions, in the order they are spoken, fetched once per video. */
export function useVideoCaptions(videoId: string) {
  return useQuery({
    queryKey: ["captions", videoId],
    queryFn: ({ signal }) => fetchVideoCaptions(videoId, signal),
    staleTime: Number.POSITIVE_INFINITY,
    select: selectCaptions,
  });
}
