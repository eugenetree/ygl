# Coding Conventions

**Analysis Date:** 2026-04-07

## Naming Patterns

**Files:**
- kebab-case throughout: `process-video-entry.use-case.ts`, `caption-clean-up.service.ts`
- Suffix encodes role: `.use-case.ts`, `.service.ts`, `.repository.ts`, `.worker.ts`, `.queue.ts`, `.mapper.ts`, `.validator.ts`, `.extractor.ts`, `.parser.ts`, `.controller.ts`, `.schemas.ts`, `.types.ts`
- Test files co-located, suffix `.test.ts`: `process-video-entry.use-case.test.ts`
- Bootstrap/entry files: `bootstrap.ts`
- Domain types in plain noun files: `video.ts`, `channel.ts`, `caption.ts`

**Classes:**
- PascalCase, mirrors filename with suffix as class suffix: `ProcessVideoEntryUseCase`, `VideoRepository`, `SearchChannelQueriesWorker`, `CaptionAnalysisService`

**Methods:**
- camelCase
- Use cases expose a single `execute()` method
- Repositories use descriptive method names: `create()`, `update()`, `createWithCaptions()`, `getNextQuery()`, `markAsSuccess()`, `markAsFailed()`
- Workers expose `run()` method

**Variables and properties:**
- camelCase throughout
- Private fields prefixed with nothing (rely on `private` modifier): `private isRunning`, `private readonly logger`

**Types and interfaces:**
- PascalCase
- Domain entity: `Video`, `Channel`, `ChannelEntry`
- Entity props (no timestamps): `VideoProps = Omit<Video, "createdAt" | "updatedAt">`
- DB row interfaces: `VideosRow`, `ChannelsRow` (plural, `Row` suffix)
- Selectable/Insertable/Updateable helpers: `VideoRow`, `InsertableVideoRow`, `UpdateableVideoRow`
- Error types: tagged unions with a `type` string discriminant: `DatabaseError`, `FetchError`, `ValidationError`

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants: `MAX_FAILED_VIDEOS_STREAK`, `SHIFT_SCAN_MIN_MS`, `CAPTIONS_PROCESSING_ALGORITHM_VERSION`
- Enum-like objects use `as const` with a matching type alias:
  ```typescript
  export const ScraperName = {
    CHANNEL_DISCOVERY: "CHANNEL_DISCOVERY",
    // ...
  } as const;
  export type ScraperName = (typeof ScraperName)[keyof typeof ScraperName];
  ```

## Code Style

**Formatter:** Prettier 3.5.3
- Tab width: 2 spaces (no tabs)
- Print width: 80 characters
- Config: `/.prettierrc`

**Linting:** ESLint 9 with `typescript-eslint`
- Config: `/eslint.config.js`
- `js/recommended` + `tseslint.configs.recommended`

**Import sorting:** `@trivago/prettier-plugin-sort-imports`
- Order defined in `.prettierrc`: `reflect-metadata` first, then external packages, then local imports

## Import Organization

**Order (enforced by prettier-plugin-sort-imports):**
1. `reflect-metadata` (IoC requirement — must be first)
2. External packages
3. Local relative imports

**Module resolution:**
- All local imports use `.js` extension (required by `module: nodenext`)
- No path aliases configured; all imports are relative

**Example:**
```typescript
import "reflect-metadata";

import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../../../types/index.js";
import { Logger } from "../../../../../_common/logger/logger.js";
import { VideoRepository } from "../../video.repository.js";
```

## Error Handling

**Core pattern: Result type (no thrown exceptions in business logic)**

```typescript
// src/types/index.ts
export type Success<T> = { ok: true; value: T };
export type Failure<T> = { ok: false; error: T };
export type Result<Value, Error> = Success<Value> | Failure<Error>;

export const Success = <T>(value: T): Success<T> => ({ ok: true, value });
export const Failure = <T>(error: T): Failure<T> => ({ ok: false, error });
```

All async operations that can fail return `Promise<Result<Value, ErrorType>>`.

**Error types are tagged unions with a `type` discriminant:**
```typescript
export type DatabaseError = {
  type: "DATABASE";
  error: Error;
};

export type FetchError =
  | { type: "FETCH_ERROR"; kind: "HTTP"; status: number; statusText: string; data: unknown }
  | { type: "FETCH_ERROR"; kind: "NETWORK"; cause: unknown }
  | { type: "FETCH_ERROR"; kind: "UNKNOWN"; cause: unknown };
```

**`tryCatch` utility wraps promises from external libraries (DB, HTTP):**
```typescript
// src/modules/_common/try-catch.ts
const result = await tryCatch(dbClient.insertInto("videos").values(video).execute());
if (!result.ok) {
  return Failure({ type: "DATABASE", error: result.error });
}
```

**Propagation pattern in use cases:**
```typescript
const result = await this.someRepository.doThing(id);
if (!result.ok) {
  this.logger.error({ error: result.error, context: { id } });
  return result; // propagate as-is
}
const value = result.value;
```

**Early return on failure** — never nest success paths.

**BaseError constraint** for generic errors:
```typescript
// src/modules/_common/errors.ts
export type BaseError = Record<string, unknown> & { type: string; }
```

## Logging

**Framework:** Custom `Logger` class (`src/modules/_common/logger/logger.ts`)
- Writes to `console` and to `logs/<category>` file simultaneously
- Constructed with `{ context, category }` — both get kebab-cased automatically

**Methods:**
- `logger.info(message: string)` — plain string
- `logger.error({ message?, error?, context? })` — structured object
- `logger.warn(message: string)` — plain string
- `logger.setContext(context: string)` — appends to existing context (`"parent:child"`)
- `logger.child({ context?, category? })` — creates child logger

**Pattern in injectable classes:**
```typescript
constructor(logger: Logger) {
  this.logger = logger.child({ context: "MyClassName", category: "my-category" });
}
// or in @injectable() use cases:
constructor(private readonly logger: Logger) {
  this.logger.setContext(MyUseCase.name);
}
```

**Log on errors before propagating:**
```typescript
if (!result.ok) {
  this.logger.error({ message: "Failed to do X", error: result.error, context: { id } });
  return result;
}
```

## Comments

**When to comment:**
- Explain non-obvious business logic decisions inline
- Section separators in test files: `// ---- Fixtures ---`, `// ---- Factory ---`, `// ---- Tests ---`
- JSDoc only on classes that need explanation (e.g., `HttpClient`)
- TODO comments are used for deferred work and type issues (see CONCERNS.md)

**Style:**
- Block comments for important algorithm notes (e.g., in `CaptionSimilarityService`)
- Inline `//` comments for short clarifications

## Function Design

**Size:** Methods are generally focused; larger algorithms are broken into private helper methods (see `CaptionSimilarityService`)

**Parameters:** Prefer named parameter objects over positional for 2+ params:
```typescript
async createWithCaptions({ video, autoCaptions, manualCaptions }: {...}): Promise<...>
mapDtoToCaptionProps({ videoId, captionsDto, type }: {...}): CaptionProps[]
```

**Return values:** Always typed explicitly on public methods; `Result<Value, Error>` for fallible operations, `void` for fire-and-forget side effects.

## Dependency Injection

**Framework:** InversifyJS with decorator metadata (`experimentalDecorators: true`, `emitDecoratorMetadata: true`)

All injectable classes are decorated with `@injectable()`. Constructor injection is the exclusive pattern:
```typescript
@injectable()
export class ProcessVideoEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoRepository: VideoRepository,
    // ...
  ) {
    this.logger.setContext(ProcessVideoEntryUseCase.name);
  }
}
```

Containers are assembled in `bootstrap.ts` files using `new Container({ autobind: true })`.

## Module Design

**Exports:** Named exports only; no default exports.

**Barrel files:** Used selectively at module boundaries (e.g., `src/modules/scraping/scrapers/video/index.ts`, `src/modules/scraping/scrapers/channel/index.ts`).

**Domain objects pattern:**
- `EntityType` = the full entity including DB timestamps
- `EntityProps` = `Omit<EntityType, "id" | "createdAt" | "updatedAt">` — used for inserts

---

*Convention analysis: 2026-04-07*
