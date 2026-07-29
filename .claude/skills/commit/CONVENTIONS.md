# Commit conventions

Mined from this repo's history. Match what's here rather than generic Conventional Commits — the two differ.

## Shape

```
<type>(<scope>): <subject>

<body>
```

## Types

| Type       | Use for                                    | Real example                                                        |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `feat`     | new behaviour                              | `feat(logger): serialize nested error causes for network diagnosability` |
| `fix`      | broken behaviour now correct               | `fix(docker): skip lifecycle scripts in prod build`                  |
| `refactor` | structure changes, behaviour doesn't       | `refactor(channel-priority): split refreshPriority into recalculate + propagate` |
| `test`     | tests only                                 | `test(captions-similarity): add fixture-based tests for calculateSimilarity` |
| `chore`    | deps, tooling, config, housekeeping        | `chore(husky): add typescript check to pre-commit hook`              |
| `docs`     | documentation only                         | `docs(testing): add scraping flow test strategy plan`                |
| `style`    | formatting with zero behaviour change      | `style: apply biome formatting and import sorting across all files`  |
| `debug`    | temporary instrumentation meant to be reverted | `debug(youtube-api): temporarily remove all yt-dlp and captions delays` |
| `revert`   | undoing an earlier commit                  | `revert: fix: exclude _debug from tsc build`                         |

`debug` is local to this repo and carries a promise that the change comes back out. Reach for it only when the user is instrumenting, never as a softer `fix`.

## Scope

Optional but usual — roughly two thirds of commits carry one. Lowercase, kebab-case, in parentheses.

Prefer a name that already exists in the tree: a module under `src/modules/` (`scraping`, `youtube-api`, `telegram`, `captions-search`, `i18n`, `api`) or a sub-area within one (`channel-priority`, `video-jobs`, `video-scraper`, `video-discovery`, `captions`). Non-source areas use their own names: `db`, `docker`, `infra`, `frontend`, `build`, `tooling`, `husky`, `skills`, `entrypoint`.

Two scopes when a change genuinely straddles: `feat(docker,scraper): add postgres healthcheck and telegram startup notification`. Omit the scope when the change is repo-wide.

## Subject

Imperative mood, lowercase first word, no trailing period, ~70 characters or fewer. `add`, not `added` or `adds`.

State the change, not the file touched: `fix(captions): order by startTime when loading captions for reprocessing` beats `fix(captions): update query`.

## Body

Optional. A one-line chore stands alone — half the history is subject-only. Add a body when the change has parts, or when it was subtle enough that the next reader will ask why.

Two styles, chosen by what the reader needs:

**Bullets — for a change with several parts.** One `-` per part, imperative, wrapped at ~80.

```
feat(search-queries-seeder): split word list by APP_ENV for dev vs prod
- Move words_dictionary.json to seeder-local data/prod.json
- Add data/dev.json with 10 generic words for local development
- Seeder reads dev.json when APP_ENV=development, prod.json otherwise
- Document APP_ENV in .env.example
```

**Root-cause prose — for a fix whose reason isn't visible in the diff.** A short paragraph on what actually broke and why this is the remedy. Reserve it for the cases that earned it.

```
fix(scraper): resolve real yt-dlp version via direct --version invocation

getVersion() called the ytdlp-nodejs wrapper's getVersionAsync(), which is
broken in v3.4.4: it invokes the binary with an empty URL plus --version, but
the wrapper's arg builder throws "URL is required." on an empty URL. Version
resolution never succeeded, so the startup log always read "yt-dlp version:
unknown".
```

## Footers

This repo doesn't use them — no issue refs, no `BREAKING CHANGE`, no trailers of any kind. The body is the last thing in the message.
