# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:**
- Node.js built-in test runner (`node:test`)
- No separate jest/vitest dependency
- Config: none (run directly via `node --test`)

**Assertion Library:**
- `node:assert/strict` — all assertions use the strict variant

**Run Commands:**
```bash
npm test                   # Run all tests: node --test --import tsx "src/**/*.test.ts"
```

No watch mode or coverage command is configured in `package.json`.

## Test File Organization

**Location:** Co-located with source files, same directory as the module under test.

**Naming:** `<filename>.test.ts` — e.g., `process-video-entry.use-case.test.ts` sits in the same directory as `process-video-entry.use-case.ts`.

**Current test files:**
```
src/modules/scraping/error-handling/process-scraper-failure.use-case.test.ts
src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.test.ts
src/modules/youtube-api/yt-api-get-video.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// ---- Fixtures ---------------------------------------------------------------

const someFixture = { id: "...", ... };

// ---- Factory ----------------------------------------------------------------

function createMocks() { ... }
function buildSut(mocks: ReturnType<typeof createMocks>) { ... }

// ---- Tests ------------------------------------------------------------------

describe("ClassName", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: ClassName;

  beforeEach(() => {
    mocks = createMocks();
    // set happy-path defaults
    mocks.dependency.method.mock.mockImplementation(() => Promise.resolve(Success(value)));
    sut = buildSut(mocks);
  });

  describe("methodOrBehaviorGroup()", () => {
    it("does something specific", async () => { ... });
  });
});
```

**Patterns:**
- `beforeEach` resets all mocks and rebuilds the SUT to ensure test isolation
- Happy-path defaults are set in `beforeEach`; individual tests override only the one dependency they care about
- Nested `describe` blocks group tests by method or logical behavior
- Test names are full sentences describing expected behavior

## Mocking

**Framework:** `mock` from `node:test` — `mock.fn<MethodSignature>()`

**Pattern — `createMocks()` factory function:**
```typescript
function createMocks() {
  return {
    logger: {
      setContext: mock.fn<Logger["setContext"]>(),
      info: mock.fn<Logger["info"]>(),
      error: mock.fn<Logger["error"]>(),
      warn: mock.fn<Logger["warn"]>(),
    },
    videoRepository: {
      createWithCaptions: mock.fn<VideoRepository["createWithCaptions"]>(),
    },
    // one entry per injected dependency
  };
}
```

**Pattern — `buildSut()` factory function:**
```typescript
function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new ProcessVideoEntryUseCase(
    mocks.logger as unknown as Logger,
    mocks.videoRepository as unknown as VideoRepository,
    // cast each mock to its interface via `as unknown as Interface`
  );
}
```

**Configuring mock behavior:**
```typescript
mocks.dependency.method.mock.mockImplementation(() =>
  Promise.resolve(Success(value))
);

// Override for failure path:
mocks.dependency.method.mock.mockImplementation(() =>
  Promise.resolve(Failure({ type: "DATABASE", error: new Error("db failure") }))
);
```

**Asserting call counts and arguments:**
```typescript
assert.equal(mocks.repo.create.mock.callCount(), 1);
assert.equal(mocks.repo.update.mock.callCount(), 0);

const arg = mocks.repo.create.mock.calls[0]!.arguments[0];
assert.equal(arg.succeededVideosStreak, 1);
```

**What to mock:**
- All injected dependencies of the SUT
- External I/O (repositories, queues, API clients, Telegram notifier)

**What NOT to mock:**
- Value objects, domain types, pure computation logic
- The SUT itself

## Fixtures and Factories

**Test Data — module-level const objects:**
```typescript
// ---- Fixtures ---------------------------------------------------------------

const videoEntry = { id: "video-1", channelId: "channel-1" };

const baseVideoDto = {
  id: "video-1",
  channelId: "channel-1",
  title: "Test Video",
  duration: 120,
  // all fields filled in, nullable ones set to null
};

const bothVideo: Video = {
  ...baseVideoDto,
  captionStatus: "BOTH",
  autoCaptions: [autoCaptionSegment],
  manualCaptions: [manualCaptionSegment],
};
```

**Location:** Defined at the top of each test file, below imports, before mock factories.

## Custom Assertion Helpers

Type-narrowing assertion functions are defined per test file when needed:

```typescript
function assertFailure<V, E>(result: Result<V, E>): asserts result is Failure<E> {
  assert.equal(result.ok, false);
}
```

Used as:
```typescript
const result = await sut.execute(videoEntry);
assertFailure(result);
assert.deepEqual(result.error, dbError); // TypeScript narrows result to Failure<E>
```

## Coverage

**Requirements:** None enforced — no coverage threshold configuration found.

**View Coverage:** No coverage command configured. Can be run manually:
```bash
node --test --experimental-test-coverage --import tsx "src/**/*.test.ts"
```

## Test Types

**Unit Tests:**
- Scope: single use case or service class in isolation
- All dependencies mocked via `createMocks()` / `buildSut()` pattern
- Files: `*.use-case.test.ts`

**Integration Tests:**
- Scope: real external calls (network, yt-dlp binary)
- Construction uses real classes without mocks
- Always skipped in CI via `describe.skip(...)`:
  ```typescript
  describe.skip("YoutubeApiGetVideo.getVideo() – captionStatus", { concurrency: false }, () => {
  ```
- Location: `src/modules/youtube-api/yt-api-get-video.test.ts`

**E2E Tests:** Not present.

## Common Patterns

**Async Testing:**
```typescript
it("returns failure when DB fails", async () => {
  mocks.repo.create.mock.mockImplementation(() =>
    Promise.resolve(Failure(dbError))
  );

  const result = await sut.execute(videoEntry);

  assertFailure(result);
  assert.deepEqual(result.error, dbError);
});
```

**Testing that a method was NOT called:**
```typescript
assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
```

**Testing message content (string includes):**
```typescript
const message = mocks.notifier.sendMessage.mock.calls[0]!.arguments[0];
assert.ok(message.includes("VIDEO"));
assert.ok(message.includes("DATABASE"));
```

**Testing object shape logged:**
```typescript
const loggedArg = mocks.logger.error.mock.calls[0]!.arguments[0];
assert.ok(
  typeof loggedArg === "object" &&
  "message" in loggedArg &&
  typeof loggedArg.message === "string" &&
  loggedArg.message.includes("Telegram"),
);
```

**Boundary / off-by-one tests:**
```typescript
it("does not skip when failedVideosStreak is one below limit", async () => {
  mocks.repo.getHealthRecord.mock.mockImplementation(() =>
    Promise.resolve(Success({ ...existingHealthRecord, failedVideosStreak: MAX_FAILED_VIDEOS_STREAK - 1 }))
  );
  const result = await sut.execute(videoEntry);
  assert.equal(result.ok, true);
});
```

---

*Testing analysis: 2026-04-07*
