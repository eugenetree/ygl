import type {
  ErrorCode,
  ErrorResponse,
  SearchQuery,
  SearchResponse,
} from "@api/contract";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "UNREADABLE_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  const body = await res.json().catch(() => undefined);
  if (res.ok) return body as T;

  const error = body as ErrorResponse | undefined;
  throw new ApiError(
    res.status,
    error?.code ?? "UNREADABLE_RESPONSE",
    error?.message ?? `Request failed with status ${res.status}`,
  );
}

export function searchClips({ q, offset, limit }: SearchQuery) {
  const params = new URLSearchParams({ q });
  if (offset !== undefined) params.set("offset", String(offset));
  if (limit !== undefined) params.set("limit", String(limit));
  return request<SearchResponse>(`/api/search?${params}`);
}
