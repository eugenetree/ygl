import type { ErrorResponse, MeResponse } from "@api/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const ME_KEY = ["me"];

async function fetchMe(signal: AbortSignal): Promise<MeResponse | null> {
  const response = await fetch("/api/me", { signal });
  if (response.ok) return response.json();
  const body: Partial<ErrorResponse> | undefined = await response
    .json()
    .catch(() => undefined);
  if (response.status === 401 && body?.code === "NOT_SIGNED_IN") return null;
  throw new Error(`Me failed with ${response.status}`);
}

/** The signed-in listener, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
    retry: 1,
  });
}

/** Shows the listener as signed out, once the API has ended their session. */
export function useSetSignedOut() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.setQueryData<MeResponse | null>(ME_KEY, null),
    [queryClient],
  );
}
