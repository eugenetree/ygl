# Unit tests hand their fakes to constructors with `as unknown as <ConcreteClass>`, which turns off type checking of the fake against the class it replaces. Is that a problem worth fixing across the codebase, and if so, how: `Pick<Class, keyof Class>` fakes, a typed mock helper, interfaces for dependencies, or something else?

**Parked:** 2026-10-24 · `feature/store-raw-data` @ `966f96a` (plus the uncommitted switch of `RawDataStore` to a concrete class)
**Where:** every unit test that builds its subject by hand, e.g. `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.test.ts`, `src/modules/youtube-api/yt-api-get-video.test.ts`, `src/modules/youtube-api/yt-api-get-channel-video-entries.test.ts`, `src/modules/api/http-server.test.ts`, `src/modules/_common/logger/testing/logger-mock.ts`

## Doubt

Dependencies are injected as concrete classes (inversify autobind), and those classes have private fields. TypeScript treats a class with private fields almost nominally: a fake can't `implements` the class, and even a plain `fake as Class` is rejected ("neither type sufficiently overlaps"), so every test goes through `as unknown as Class`. That cast accepts anything. A fake missing a method the subject now calls compiles, and only fails at runtime with "is not a function". The question came up while switching `RawDataStore` from an interface plus symbol token to a concrete class: its fake moved from `implements RawDataStore` to `implements Pick<RawDataStore, keyof RawDataStore>` (`keyof` only sees public members), but the constructor call still needs `as unknown as RawDataStore`.

## Sanity check

**holds**: `grep "as unknown as [A-Z]" src/**/*.test.ts` finds 34 casts in 14 test files. 14 of them are `as unknown as Logger`; the rest are one or two per class: `YtDlpClient` (2), `YoutubeApiGetVideo`, `VideoRepository`, `VideoMapper`, `VideoEntriesQueue`, `TelegramNotifier`, `ProcessVideoEntryUseCase`, `ManualCaptionsValidator`, `AutoCaptionsValidator`, `FindVideoCaptionsUseCase`, `FindChannelVideosUseCase`, `FindCaptionsUseCase`, `ClipVideoRepository`, `ChannelsQueue`, `CaptionsService`, `CaptionSimilarityService`, `CaptionAnalysisService`, `RawDataStore`, and the Elasticsearch `Client`. So it's the codebase's standard way of injecting test doubles, not a one-off.

## Context

How much checking the cast actually loses varies by the shape of the fake:
- **Objects of `mock.fn<Class["method"]>()`** (the most common shape, e.g. `createMocks()` in `process-video-entry.use-case.test.ts`; 40 `mock.fn<…>` uses across tests): each method's signature is still checked, because `Class["method"]` types it. What's lost is completeness: a method the subject starts calling but the mock object doesn't have.
- **Hand-written fake classes** (`MockYtDlpClient` in `yt-api-get-video.test.ts`, `FailingYtDlpClient` in `yt-api-get-channel-video-entries.test.ts`): nothing ties their method signatures to `YtDlpClient`, so they can drift silently.
- **`FakeRawDataStore`** (`yt-api-get-video.test.ts`) is the one fake checked by `implements Pick<RawDataStore, keyof RawDataStore>`. The cast at the constructor is still there, but the fake can't drift.
- **`createLoggerMock()`** (`src/modules/_common/logger/testing/logger-mock.ts`) is a shared, untyped mock, and is the source of most of the `Logger` casts.

Options seen so far (none weighed with the user yet):
1. Leave it. The casts are uniform and mostly sit over `mock.fn<Class["method"]>` objects.
2. Type fakes as `Pick<Class, keyof Class>` (or `Pick<Class, "a" | "b">` for partial mocks) so the fake is checked, and keep one cast at the constructor. Possibly a tiny helper like `fake<T>(f: Pick<T, keyof T>): T` to hide the cast in one place.
3. Type constructor parameters as `Pick<Class, …>` or an interface instead of the concrete class. That needs `@inject` tokens for inversify, which is the thing the `RawDataStore` switch just moved away from.
4. Type `createLoggerMock()` as `Pick<Logger, …>` so the 14 Logger casts at least check the mock.
