# Testing Patterns

**Analysis Date:** 2026-07-26

## Test Framework

**Runner:**
- Node.js built-in `node --test` module (no external runner)
- Version: Node.js 22.13.9 (from package.json @types/node)
- Config: Executed via npm script with `--import tsx` for TypeScript support

**Assertion Library:**
- `node:assert/strict` - Node.js built-in strict assertions (no external library)

**Test Utilities:**
- `node:test` module exports: `describe`, `it`, `beforeEach`, `afterEach`, `mock`
- Mock implementation: `node:test`'s built-in mocking via `mock.fn()`

**Run Commands:**
```bash
npm test                  # Run all tests matching src/**/*.test.ts
npm run typecheck         # Run TypeScript type checking
npm run build             # Build and check for compilation errors
```

## Test File Organization

**Location:**
- Co-located with source files: `foo.ts` + `foo.test.ts` in same directory
- Database migrations exception: Tests in `src/` tree only, no separate test directory

**Naming:**
- `.test.ts` suffix for all test files
- Example: `channel-priority.calculator.test.ts`, `caption-analysis.service.test.ts`

**Structure:**
```
src/modules/
├── scraping/
│   ├── channel-priority/
│   │   ├── channel-priority.calculator.ts
│   │   ├── channel-priority.calculator.test.ts
│   │   └── channel-priority.constants.ts
│   └── push-channel/
│       ├── push-channel.use-case.ts
│       └── push-channel.use-case.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe("ChannelPriorityCalculator", () => {
  describe("caption gate", () => {
    it("does not apply caption bonus or penalty below min videos threshold", () => {
      // Arrange
      const result = calculator.calculate({ ... });
      
      // Assert
      assert.equal(result.scrapingScore, 0);
    });
  });
});
```

**Patterns:**

1. **Nested describe blocks** - Group related tests by behavior
   - Top level: class/function name
   - Second level: method or feature name
   - Third level: specific test case conditions

2. **Test sections** - Clear Arrange/Assert flow (no Setup/Execute/Verify naming)
   - Inline setup with test data
   - Direct assertions, no helper assertions
   - Comments optional for clarity

3. **Fixtures pattern** - Inline fixture builders at top of test file
   ```typescript
   const baseStats: ChannelStats = {
     isBoosted: false,
     subscriberCount: 0,
     totalProcessed: 0,
     validCaptions: 0,
     // ...
   };
   ```

4. **Factory pattern** - Inline factory functions for creating SUT and mocks
   ```typescript
   function createMocks() {
     return {
       manualCaptionsValidator: { validate: mock.fn<...>() },
       // ...
     };
   }
   
   function buildSut(mocks) {
     return new CaptionAnalysisService(
       mocks.manualCaptionsValidator,
       // ...
     );
   }
   ```

## Mocking

**Framework:** `node:test` built-in mocking

**Patterns:**

1. **Mock Function Creation:**
   ```typescript
   const mockFn = mock.fn<SomeType["method"]>();
   ```

2. **Mock Setup in beforeEach:**
   ```typescript
   beforeEach(() => {
     mocks.manualCaptionsValidator.validate.mock.mockImplementation(() =>
       Success(undefined)
     );
   });
   ```

3. **Accessing Call Information:**
   ```typescript
   mocks.logger.error.mock.callCount()              // Number of calls
   mocks.logger.error.mock.calls[0]!.arguments[0]   // First call's first arg
   ```

4. **Mock Casting to Real Type:**
   ```typescript
   mocks.logger as unknown as Logger  // Type assertion for DI
   ```

**What to Mock:**
- External services and repositories (database calls, HTTP clients)
- Collaborators injected via constructor (Logger, TelegramNotifier)
- Third-party services (Elasticsearch, etc.)

**What NOT to Mock:**
- Pure calculation logic (use real implementations)
- Data transformers and mappers
- Validation logic (use real validators)
- Return types (use real Success/Failure constructors)

## Fixtures and Factories

**Test Data:**
```typescript
// Inline fixtures for simple data
const autoSegs: CaptionSegment[] = [seg("hello world")];

// Factory functions for complex setup
const seg = (text: string, start = 0, end = 1): CaptionSegment => ({
  text,
  startTime: start,
  endTime: end,
  duration: end - start,
});

// Loaded fixtures for large datasets
function loadFixture(name: string): CaptionSegment[] {
  return JSON.parse(
    readFileSync(`src/fixtures/captions/converted/${name}.json`, "utf-8")
  );
}
```

**Location:**
- Inline in test file for simple fixtures
- `src/fixtures/` directory for large/reusable test data
- Example: `src/fixtures/captions/converted/{name}.json` for caption comparison tests

## Coverage

**Requirements:** No coverage threshold enforced

**Current Test Count:** 13 test files in `src/**/*.test.ts`

**Test Types by Domain:**
- Priority calculation: `channel-priority.calculator.test.ts` (15+ test cases)
- Caption analysis: `caption-analysis.service.test.ts` (8+ test cases)
- Similarity matching: `captions-similarity.service.test.ts` (2+ test cases with fixture data)
- Video entry processing: `process-video-entry.use-case.test.ts` (100+ lines)
- Video entries queue: `video-entries.queue.test.ts`
- Use cases: `process-scraper-failure.use-case.test.ts`, `push-channel.use-case.test.ts`
- API: `yt-api-get-video.test.ts`, `yt-api-get-video.unit.test.ts`

## Test Types

**Unit Tests:**
- Scope: Single class or function in isolation
- Mocking: All external dependencies (services, repositories)
- Examples: `ChannelPriorityCalculator.calculate()`, `CaptionAnalysisService.analyze()`
- Characteristics: Fast, deterministic, no I/O

**Integration Tests:**
- Scope: Multiple components working together
- Mocking: External APIs only (HTTP, database connections)
- Examples: `ProcessVideoEntryUseCase` with real validators and mappers
- Characteristics: May use test fixtures, database (pg-mem), but not real APIs

**E2E Tests:**
- Status: Not observed in current codebase
- Framework: Not configured
- Approach: If added, would test full request path via HTTP

## Common Patterns

**Async Testing:**
```typescript
it("returns Success when operation completes", async () => {
  const result = await sut.execute({ scraperName: "VIDEO", error });
  
  assert.equal(result.ok, true);
});
```

**Error Testing:**
```typescript
it("returns Success even when Telegram delivery fails", async () => {
  mocks.telegramNotificationService.sendMessage.mock.mockImplementation(() =>
    Promise.resolve(
      Failure({
        type: "TELEGRAM_NOTIFICATION_ERROR" as const,
        cause: "timeout",
      })
    )
  );

  const result = await sut.execute({ scraperName: "CHANNEL", error });

  assert.equal(result.ok, true);
});
```

**Discriminated Union Testing:**
```typescript
it("applies penalty when caption rate is at the threshold", () => {
  const result = calculator.calculate({
    ...baseStats,
    totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
    validCaptions: PRIORITY_STATS_MIN_VIDEOS * 0.1,
  });

  assert.equal(result.scrapingScore, PRIORITY_BAD_CHANNEL_PENALTY);
});
```

**Mock Verification:**
```typescript
it("calls sendMessage with formatted message containing scraper name", async () => {
  await sut.execute({ scraperName: "VIDEO", error });

  assert.equal(
    mocks.telegramNotificationService.sendMessage.mock.callCount(),
    1
  );
  const message =
    mocks.telegramNotificationService.sendMessage.mock.calls[0]!.arguments[0];
  assert.ok(message.includes("VIDEO"));
});
```

## Test Conventions

**Naming:**
- Test names describe the condition and expected outcome
- Use "does", "returns", "throws", "calls" verb prefixes
- Avoid "should" prefix; prefer "does" or "returns"

**Structure:**
- One assertion per test is preferred, but multiple related assertions are acceptable
- Each test should be independently runnable
- Use `beforeEach` for common setup (mock initialization)
- Use `afterEach` sparingly (cleanup not typically needed for unit tests)

**Readability:**
- Test data with clear names: `baseStats`, `bothVideo`, `autoOnlyVideo`
- Factory/builder pattern for complex test objects
- Fixtures section commented with `// ---- Fixtures -------` separator
- Factory section commented with `// ---- Factory --------` separator
- Tests section commented with `// ---- Tests ----------` separator

---

*Testing analysis: 2026-07-26*
