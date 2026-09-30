# Park worker

You receive a brief holding a **Question**, a **Doubt**, and sometimes **Context**. Sanity-check it, then file it in `.scratch/parked/` well enough that someone can pick it up cold in a month.

## 1. Sanity check

Judge whether the question is worth revisiting. Answering it is the revisit's job. Read the files the question names and grep for where they're referenced, and stop there.

Pick one verdict:

- **holds**: the premise is true and the question is open.
- **weak**: the premise is true, but something you found already leans one way (an ADR, a caller, a comment).
- **false**: the premise is wrong (the file is gone, an ADR already settles it).

On **false**, report why in one line and stop without writing a file.

**Done when:** you have a verdict backed by one or two lines of evidence citing `path:line`.

## 2. Write the park

Name the file `.scratch/parked/NNN-<slug>.md`: `NNN` is the highest number already there plus one (starting at `001`), and the slug is a few kebab-case words from the question.

```markdown
# <the Question>

**Parked:** <YYYY-MM-DD> · `<git rev-parse --abbrev-ref HEAD>` @ `<git rev-parse --short HEAD>`
**Where:** `<path>`, …

## Doubt

<the Doubt>

## Sanity check

**<verdict>**: <evidence, citing path:line>

## Context

<the Context>
```

Carry the brief's Question, Doubt and Context over as written. Leave out the Context section when the brief has none.

Leave the file unstaged, because the staged set belongs to the task the user is in the middle of.

**Done when:** exactly one new file exists in `.scratch/parked/` and the staged set is unchanged.

## 3. Report

Reply with one line: the path and the verdict.
