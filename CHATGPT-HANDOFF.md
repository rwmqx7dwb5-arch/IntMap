# IntMap ChatGPT global handoff protocol

This file defines how **any ChatGPT chat** should capture IntMap implementation intent without requiring the user to work inside a particular Project.

Canonical cross-chat inbox: GitHub issue **#225 — `[SYSTEM] GPT Handoff Inbox`** in `rwmqx7dwb5-arch/IntMap`.

## When to capture

Capture when the user expresses an implementation/change intent for IntMap, even conversationally, for example:

- “これ実装したい”
- “さっきのやつ入れたい”
- “Windy見てたらこれも欲しくなった”
- “前話してたあれを実装したい”
- “やっぱり前の案をこう変えたい”

Do **not** enqueue a task when the user is only asking a factual question, discussing an idea hypothetically, or asking for an opinion without indicating that IntMap should actually be changed.

## Vague references

For references such as “前話してたあれ”, “さっきの”, “前の案”:

1. Use the current conversation first.
2. If the referent is not present, retrieve the user's prior conversation context/memory before asking them to repeat it.
3. Inspect active inbox events when useful to identify an existing task ID.
4. Resolve the intended concrete requirement and preserve the user's latest decision over older versions.
5. If retrieval still leaves more than one materially plausible referent, ask one concise clarification rather than guessing.

The user should not have to remember task IDs or say “add this to HANDOFF”.

## Writing to the inbox

Use the connected GitHub account and add a comment to issue #225. Only comments authored by `rwmqx7dwb5-arch` are imported locally.

For a new task, generate a stable ID ending in at least three digits, preferably `IM-YYYYMMDD-NNN`. For a continuation/change to an existing active task, reuse that task's ID and publish the **full current replacement task**, not a fragmentary patch.

Upsert comment:

```text
<!-- INTMAP-HANDOFF-EVENT v=1 action=upsert task=IM-20260821-001 -->
<!-- HANDOFF:TASK id="IM-20260821-001" -->
## IM-20260821-001 — Short title

### Requirements
- Concrete current requirements, merged with the user's prior decisions.

### Done when
- Observable acceptance criteria.
<!-- HANDOFF:END id="IM-20260821-001" -->
<!-- INTMAP-HANDOFF-EVENT-END -->
```

If the user explicitly abandons an active not-yet-verified task, publish:

```text
<!-- INTMAP-HANDOFF-EVENT v=1 action=cancel task=IM-20260821-001 -->
<!-- INTMAP-HANDOFF-EVENT-END -->
```

Do not put secrets, credentials, private data, or raw conversation transcripts in the public issue. Convert the user's intent into the minimum implementation specification needed by Claude.

## Local import and Claude boundary

`scripts/handoff-inbox.mjs pull` imports only new trusted events into `GPT-HANDOFF/HANDOFF.md`. It keeps a per-task comment cursor outside the repository, so repeatedly pulling does not overwrite later local Work edits unless a newer ordinary-chat event for that same task arrives.

Claude never reads issue #225 as requirements. Claude first pulls the inbox, then reads the local HANDOFF. Therefore the local `HANDOFF.md` remains the only semantic GPT → Claude communication file.

Fully user-verified task IDs are archived locally; old issue events cannot resurrect them. If a completed idea genuinely needs new work later, create a new task ID.
