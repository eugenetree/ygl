# 06 — Listeners can delete their account

**What to build:** A signed-in listener opens the avatar menu, chooses to delete
their account, confirms, and is signed out with their user, sessions and Google
link removed. Signing in with Google again afterwards creates a fresh account.

This uses better-auth's own account deletion route; there is no controller of
ours to write.

**Blocked by:** 05 — Listeners sign in with Google.

**Status:** ready-for-agent

- [ ] Account deletion is enabled in the better-auth config.
- [ ] The avatar menu offers "Delete account", which asks for confirmation before calling better-auth's deletion through its React client.
- [ ] After deletion the listener is signed out and the header shows the sign-in button.
- [ ] The user's row, their sessions and their account link are gone from Postgres.
- [ ] Signing in with the same Google account afterwards creates a new user with a new id.
