# 06 — Listeners can delete their account

**What to build:** A signed-in listener opens the avatar menu, chooses to delete
their account, confirms, and is signed out with their user, sessions and Google
link removed. Signing in with Google again afterwards creates a fresh account.

This uses better-auth's own account deletion route; there is no controller of
ours to write.

**Blocked by:** 05 — Listeners sign in with Google.

**Status:** ready-for-agent

- [x] Account deletion is enabled in the better-auth config.
- [x] The avatar menu offers "Delete account", which asks for confirmation before calling better-auth's deletion through its React client.
- [x] After deletion the listener is signed out and the header shows the sign-in button.
- [x] The user's row, their sessions and their account link are gone from Postgres.
- [x] Signing in with the same Google account afterwards creates a new user with a new id.

## Comments

- The database suite drives the whole flow through the HTTP app with real
  better-auth on a migrated test database (`account.db.test.ts`): sign in with
  Google, delete the account, sign in again. Only Google's token endpoint is
  faked; the callback reads the profile from the id token without checking its
  signature, so no key is needed.
- Deleting from one browser also ends the listener's sessions on every other
  device, and the deleting browser's session cookie is cleared.
- better-auth only deletes for a session created within its `freshAge`, one day
  by default; an older one gets `SESSION_EXPIRED`. Google-only listeners have no
  password to re-enter, so the menu asks them to sign in again and then delete.
  `freshAge` was left at the default (ADR-0005's addendum).
- Deletion goes through `/delete-user` with a fresh session. Its email
  confirmation route, `/delete-user/callback`, is disabled with the other
  routes the API doesn't use.
- The confirmation is a step inside the avatar menu, not a modal. Closing the
  menu cancels it.
- Not yet checked: the Google round trip after deletion with a real Google
  client, and the menu on screen. The frontend typechecks, but nobody has
  clicked through it in a browser.
