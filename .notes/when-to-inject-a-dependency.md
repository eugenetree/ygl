# When to inject a dependency vs. keep it built into the service

Personal note. Written after debating whether the pause between videos in
`VideoEntriesWorker` deserved its own injectable dependency or should have
been a plain `await setTimeout(...)`.

## The rule

Ask one question about the thing you are about to call:

> Does it cross the process boundary, or is it non-deterministic?

- **Yes** → make it a dependency (constructor param, DI token, layer).
  Examples: child processes, network, filesystem, env, time (`setTimeout`,
  `Date.now`), randomness (`Math.random`).
- **No** → keep it built in and test it through the public API.
  Examples: parsing, mapping, validation, error classification, any pure
  helper.

Injecting a pure helper just so a test can mock it is *test-induced design
damage* (DHH, "Is TDD Dead?" debate with Kent Beck and Martin Fowler, 2014).
Injecting a boundary is not "for tests" — it is what keeps the class from
being welded to one specific way of talking to the outside world; the
testability is a side effect.

## Why the pause got a dependency

`await setTimeout(5_000 + jitter)` inline would have made every worker test
wait 5-10 real seconds per processed entry. Both fixes are legitimate:

| Option | Good for | Cost |
|---|---|---|
| Fake timers (`node:test` `mock.timers`, sinon, jest) | Pure delays where the *duration* matters | Global state to enable/reset; awkward with promise chains; useless for the yt-dlp process itself |
| Constructor param with a default (what we did) | Any boundary, uniform with `YT_DLP_RUNNER` | One extra visible param |
| Module mocking (`jest.mock`, proxyquire, `mock.module`) | Jest/CJS legacy without DI | Couples tests to import paths; ESM support is shaky |

We already needed a seam for the child process (`YT_DLP_RUNNER`), so the
pause followed the same shape for consistency. The class still exposes
`new YtDlpClient(logger)` — the seam is `@optional()` with a default, so
callers never see it.

## Example from this codebase

`YtDlpClient` does three kinds of work. Only one is injected:

```ts
// 1. Boundary — injected. Spawns a process; non-deterministic, slow, needs a binary.
export type YtDlpRunner = (url: string, args: string[]) => Promise<YtDlpRunResult>;
export const YT_DLP_RUNNER = Symbol.for("YT_DLP_RUNNER");

constructor(logger: Logger, @optional() @inject(YT_DLP_RUNNER) runner?: YtDlpRunner) {
  this.run = runner ?? ((url, args) => this.runWithWrapper(url, args));
}

// 2. Pure logic — built in. Tested by feeding stderr strings through the public API.
export function classifyUnprocessable(message: string): UnprocessableVideoError | null {
  if (message.includes(MEMBERS_ONLY_MESSAGE)) return { type: "MEMBERS_ONLY_VIDEO", message };
  // ...
}

// 3. Composition — built in. Just glues 1 and 2 together.
private async runChecked(url: string, args: string[]) {
  const result = await this.run(url, [...this.baseArgs(), ...args]);
  if (result.exitCode !== 0) return Failure(toYtDlpFailure(result.stderr));
  return Success(result);
}
```

Same split in `VideoEntriesWorker`: the pause (time) is injected, the
success/skip/fail branching is not.

## How other stacks phrase the same rule

- **NestJS** — register the boundary as a provider in the module
  (`{ provide: YT_DLP_RUNNER, useValue: spawnRunner }`) and swap it with
  `overrideProvider` in `TestingModule`. The default lives in the module, not
  the class. `@Optional()` exists but is reserved for genuinely optional deps.
- **Effect** — every dependency is a `Context.Tag` and shows up in the type;
  the default is a `Layer`. Time and randomness are built-in services, so
  `Effect.sleep` is virtualised by `TestClock` with no seam of your own.

Both move the default *out* of the class. With inversify the same is possible
(`container.bind(PAUSE_BETWEEN_ENTRIES).toConstantValue(randomizedPause)`),
at the cost of touching container config.

## Reading

- Freeman & Pryce, *Growing Object-Oriented Software, Guided by Tests* —
  "only mock types you own": wrap the third-party thing in a narrow interface
  of yours, mock that.
- Mark Seemann, *Dependency Injection: Principles, Practices, and Patterns* —
  *ambient context* (global `Date.now`, `setTimeout`, `Math.random`) as an
  anti-pattern; inject a clock.
- Michael Feathers, *Working Effectively with Legacy Code* — the term *seam*;
  constructor param with a default is the cheapest one.
- James Shore, *Testing Without Mocks* — the *Nullable* pattern: same idea,
  packaged as a `createNull()` factory instead of a param.
- Martin Fowler, *Mocks Aren't Stubs* — why heavy module mocking is a smell.
- Robert Martin, *When to Mock* — mock across architecturally significant
  boundaries, not inside them.
