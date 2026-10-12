import { createAuthClient } from "better-auth/client";

// No baseURL: better-auth is served at /api/auth on the site's own origin
// (ADR-0008), which is the client's default.
export const authClient = createAuthClient();
