# Issue 1 — Env-split reference seeder (dev vs prod word list)

Source PRD: `docs/prd/prd-dev-data-seeder.md`

## What to build

Make the existing search-query reference seeder seed a tiny word list in local development while leaving production behaviour unchanged. Today `SearchChannelQueriesSeeder` seeds the entire `words_dictionary.json` (~370k queries + ~370k discovery jobs) on first boot of a fresh DB, which floods local environments.

Split the word source into two files co-located with the seeder: a `prod.json` (the current dictionary, moved verbatim) and a `dev.json` (~10 generic words, same object-with-word-keys shape). The seeder selects which file to read based on a new `APP_ENV` environment variable — `development` uses `dev.json`, anything else (including unset) uses `prod.json`. The default therefore keeps production safe when the flag is absent; only a local `.env` opts into the small list.

This stays wired into app startup via the existing idempotent `seedIfNeeded()` — search queries are genuine reference data appropriate in both environments; dev simply gets fewer. The only behavioural change to the seeder is which file path it reads.

## Acceptance criteria

- [ ] The dictionary is moved into a seeder-local data folder as `prod.json`; the root `words_dictionary.json` is removed.
- [ ] A `dev.json` exists with ~10 generic words in the same shape the seeder already parses (`Object.keys(...)` logic unchanged).
- [ ] Seeder reads `dev.json` when `APP_ENV === "development"` and `prod.json` otherwise (unset → prod).
- [ ] Booting a fresh DB with `APP_ENV=development` seeds ~10 `searchChannelQueries` (and their discovery jobs); unset/other seeds the full dictionary.
- [ ] `APP_ENV` is documented in `.env.example`.
- [ ] Existing `seedIfNeeded()` idempotency and startup wiring are preserved (no reseed when the table already has rows).

## Blocked by

None — can start immediately. Independent of Issue 2.
