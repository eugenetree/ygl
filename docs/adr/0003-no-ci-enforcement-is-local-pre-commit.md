# No CI — test enforcement is the local pre-commit hook

There is deliberately no continuous integration for this repo. The test suite is
enforced by the husky pre-commit hook, which runs lint, typecheck, and the pure
and database suites. `--no-verify` is the accepted bypass for work-in-progress
commits.

This is a decision, not an oversight. The absence of `.github/workflows` should
not be read as a gap to be filled.

## Considered alternatives

- **GitHub Actions on push/PR** — the obvious choice, and the recommended one.
  Runners have Docker, so the Testcontainers-based database tests
  (ADR-0002) would work there unchanged. Rejected in favour of keeping
  enforcement local and immediate.
- **pre-push instead of pre-commit** — fires far less often, so Docker being
  down never blocks a work-in-progress commit. Rejected: the tighter loop is
  worth the per-commit cost.

## Consequences

- Every commit requires Docker running, because the database suite needs a
  container. `--no-verify` when that is not wanted.
- `main` is never verified independently of a developer's machine. Nothing
  catches a `--no-verify` commit that breaks the suite, and a fresh clone has no
  hooks installed until `npm install` runs `husky`.

## When to reopen

If a second contributor joins, or a check appears that genuinely cannot run
locally, this trade-off changes and CI should be reconsidered. Raise it as a
reason to revisit this ADR rather than as a missing piece of setup.
