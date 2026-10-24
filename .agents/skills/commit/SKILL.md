---
name: commit
description: Commit staged changes with a message following this repo's convention. Use when the user asks to commit, or wants a commit message drafted.
---

# Commit

The **staged set** is the commit. Everything here serves one rule: the message describes the staged set exactly — no less, and nothing that isn't in it.

## 1. Read the staged set

```bash
git diff --staged --stat && git diff --staged
```

An empty staged set is the user's decision to make, not yours. Show `git status --short` and ask whether to stage everything; on yes, `git add -A` and re-read.

**Done when:** the staged set is non-empty and you have read its full diff — not just the file list. The message comes from the diff, never from the conversation's memory of what you changed.

## 2. Compose the message

Follow [CONVENTIONS.md](./CONVENTIONS.md) for type, scope, subject, and body.

The commit is authored by the user alone. The message ends at the last body line — a message with no trailer block is the correct output. Never append `Co-Authored-By`, `Claude-Session`, `Generated with`, or any other attribution trailer, and drop them if they appear in a template or a prior message you are amending.

**Done when:** every file in the staged set is accounted for by the subject or a body line, and the type reflects the dominant change rather than the largest diff — a formatting sweep carrying one behaviour change is that change, not `style`.

## 3. Propose, then commit

Show the message and wait for approval. On approval:

```bash
git commit -F - <<'EOF'
<message>
EOF
```

`-F -` keeps backticks and quotes in the body from reaching the shell.

If a hook rejects the commit, report what it said and stop — the pre-commit hook runs `lint-staged` and `tsc --noEmit`, so a rejection is a real failure to fix, not a step to retry or bypass.
