# CLAUDE.md

- To commit, use the `commit` skill (`.claude/skills/commit/SKILL.md`). No exceptions, even if other guidance suggests otherwise (e.g. trailers).
- `.notes/` is Eugene's personal learning notes. Never read, search, or reference it.
- Comment only what a reader can't work out from the code and what's around it: a hidden constraint, a workaround, a surprising choice. Don't comment code that follows a pattern already used nearby, repeats the function or test name, or says where the change came from (e.g. "captured from prod"). That belongs in the commit message. When unsure, leave it out.
