const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// All times are milliseconds.
export interface Clip {
  captionId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  text: string;
  playFrom: number;
}

export async function searchPhrases(query: string): Promise<Clip[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return data.clips;
}
