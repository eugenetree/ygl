---
name: park
description: Park a doubt or open question in .scratch/parked/ to revisit later, without derailing the current task.
argument-hint: "The question to park"
disable-model-invocation: true
---

# Park

Park the question in `$ARGUMENTS`, the way a meeting's parking lot holds an off-topic point. You write the **brief**. A subagent sanity-checks it and files it, so this conversation stays on the task it was on.

## 1. Write the brief

The subagent starts cold: it sees the brief and the repo, never this conversation. Turn the user's words into a brief that stands alone:

- **Question**: phrased as a question, with every "this" or "that test" replaced by a path.
- **Doubt**: the specific suspicion behind it, drawn from the user's words and what led up to them. Keep the user's phrasing where it's already specific. Write "none given" when the conversation holds no reason.
- **Context**: anything else a cold reader needs, such as the ticket in progress (its `.scratch` issue path) or options already ruled out. Leave it out when there's nothing to add.

Build the brief from what this conversation already holds, because investigating is the subagent's job.

**Done when:** someone who never saw this conversation could act on the brief.

## 2. Hand off

Spawn a subagent, in the background and on a mid-range model where you can choose. Its prompt is the brief plus the absolute path of [`worker.md`](worker.md) in this skill's directory, with the instruction to follow it. Reply with one line saying it's parking.

When you can't spawn a subagent, follow `worker.md` yourself with the brief.

When the subagent's result arrives, pass on its one line.
