"use client";

import {
  environmentManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/lib/theme";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // A fresh client per server render keeps one request's data out of
  // another's. Not useState: React drops state when a render suspends before
  // its first commit, which would throw the client away.
  if (environmentManager.isServer()) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      <ThemedToaster />
    </QueryClientProvider>
  );
}

// Always mounted, so its `useTheme` also keeps the html element's class in
// step with the system and other tabs on pages without a theme toggle.
function ThemedToaster() {
  return <Toaster theme={useTheme()} />;
}
