# Coding standards

Judgement calls a reviewer applies to a diff. Biome and `tsc` enforce the rest.

## Module boundaries

A transport module (`telegram/`, `api/`) reaches a feature module only through
the feature's use cases: `TasksController` calls
`GetReprocessCaptionsStatusUseCase`, never `VideoRepository`. The use cases are
the feature's public API, so a Telegram command and an HTTP route asking the
same thing run the same code. Importing a feature's types for their shape is
fine (`RebuildProgress`). What belongs to the transport stays in it: the reply's
wording and formatting, and `_common/` tools like `Logger`. A feature's task is
requested and read through that feature's use cases, even though `TaskQueue`
lives in `_common/`.

## Test files

A test file sits beside the file it tests and takes its name, plus the suffix
for what it needs: `task-queue.ts` is tested by `task-queue.db.test.ts`,
`captions.extractor.ts` by `captions.extractor.test.ts`. A source file that
splits in two splits its tests with it. Helpers that several test files share
go in a `testing/` folder beside them.

A test of something that spans files is named after that thing: a migration's
test after the migration (`repair-auto-caption-end-times.db.test.ts`), an HTTP
flow's after the flow (`account.db.test.ts`).

## Comments

Comment only what a reader can't work out from the code and what's around it:
a hidden constraint, a workaround, a surprising choice. Don't comment code that
follows a pattern already used nearby, repeats the function or test name, or
says where the change came from (e.g. "captured from prod"). That belongs in
the commit message. When unsure, leave it out.
