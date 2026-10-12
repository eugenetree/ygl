import { toast } from "sonner";

// better-auth's client is imported on first use, so pages don't load it until
// the listener signs in or out.
async function loadAuthClient() {
  return (await import("@/lib/auth-client")).authClient;
}

/**
 * Sends the browser to Google, which returns it to the current page, query
 * string included, whether sign-in succeeds or fails.
 */
export async function signIn(): Promise<void> {
  const here = window.location.pathname + window.location.search;
  try {
    const authClient = await loadAuthClient();
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: here,
      errorCallbackURL: here,
    });
    if (!error) return;
  } catch {}
  toast("Couldn't start signing in. Try again.");
}

export async function signOut(): Promise<boolean> {
  try {
    const authClient = await loadAuthClient();
    const { error } = await authClient.signOut();
    return !error;
  } catch {
    return false;
  }
}

export type DeleteAccountResult = "deleted" | "session-expired" | "failed";

export async function deleteAccount(): Promise<DeleteAccountResult> {
  try {
    const authClient = await loadAuthClient();
    const { error } = await authClient.deleteUser();
    if (!error) return "deleted";
    // better-auth deletes only from a session signed in within the last day
    // (ADR-0005).
    return error.code === "SESSION_EXPIRED" ? "session-expired" : "failed";
  } catch {
    return "failed";
  }
}
