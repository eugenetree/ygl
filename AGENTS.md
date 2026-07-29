## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

## Memory

**Never persist anything about this project outside the repo.** Do not write to
the harness memory store, a home-directory memory file, or any other location
that is not committed alongside the code.

Anything worth remembering across sessions belongs in a tracked file, chosen by
what kind of fact it is:

- **A decision and its rationale** — `docs/adr/`, following `ADR-FORMAT`. This
  includes deliberate *no*-s ("we are not adding X, because…"), which are the
  most likely thing to be re-proposed by a future agent that lacks the context.
- **Domain vocabulary** — `CONTEXT.md`. Glossary only, no implementation detail.
- **In-flight work, specs, tickets** — `.scratch/<feature-slug>/`.
- **A convention agents must follow** — this file.

The reason is reviewability: an out-of-repo note is invisible to `git log`, to
code review, and to everyone but the one machine it was written on. It can drift
from the code with nothing to catch it. A decision that cannot be reviewed is
not a decision the project has made.
