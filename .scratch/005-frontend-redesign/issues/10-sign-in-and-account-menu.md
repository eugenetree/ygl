# 10 — Sign-in and the account menu

**What to build:** Every header has a "Sign in" button that goes straight to
Google and comes back to the same page, accent included. Once signed in, the
listener's Google avatar replaces it. The avatar opens a menu with their name
and email, Sign out, and Delete account. Deleting asks for confirmation, and
handles better-auth's "session too old" case with a "Sign in again" path
(ADR-0005).

**Blocked by:** 05 — Desktop, tablet and phone layouts

**Status:** ready-for-agent

- [ ] The signed-in user comes from `/api/me` through TanStack Query in the browser. A 401 with NOT_SIGNED_IN means signed out.
- [ ] The sign-in slot is reserved until `/api/me` answers, so a signed-in listener never sees "Sign in" flash.
- [ ] Signed out: an outlined "Sign in" button.
  - It starts better-auth's Google sign-in.
  - Its callback and error callback are the current URL, path and query string included.
- [ ] Signed in: the Google avatar, loaded without a referrer, opens a menu with the name, email, Sign out and Delete account.
- [ ] Sign out signs the listener out and the header shows "Sign in" again.
- [ ] Delete account opens a confirmation dialog with these steps:
  - confirming;
  - deleting;
  - failed, with retry;
  - session too old (`SESSION_EXPIRED`), which offers "Sign in again" and returns to the same page.

  A successful deletion leaves the listener signed out.
- [ ] The control appears in home's header and in every search page header, icon-sized on tablets and phones.
- [ ] Checked against the local API with Google sign-in configured and `PUBLIC_ORIGIN` at `http://localhost:3000`.
