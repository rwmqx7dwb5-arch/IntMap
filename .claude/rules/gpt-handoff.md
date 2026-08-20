# GPT → Claude handoff protocol

This rule is permanent for IntMap.

## Ownership

- ChatGPT is the semantic editor of the local `GPT-HANDOFF/HANDOFF.md` file.
- The user may develop requirements either in the local Work session or in any ordinary ChatGPT chat.
- Ordinary-chat implementation intent is staged through the owner-only GitHub inbox described by `CHATGPT-HANDOFF.md`; `scripts/handoff-inbox.mjs` imports it into the local HANDOFF.
- Claude **must not** directly edit, rewrite, reorganize, simplify, add to, or delete requirement text in `GPT-HANDOFF/HANDOFF.md`.
- Claude must not treat GitHub issue #225 as a specification source. The local HANDOFF is the only semantic GPT → Claude channel.
- The machine state maintained by `scripts/handoff.mjs` and `scripts/handoff-inbox.mjs` is status/synchronization metadata, not a second semantic communication channel.

## At the beginning of implementation work

1. Run `node scripts/handoff.mjs init` if the handoff workspace does not yet exist.
2. Run `node scripts/handoff-inbox.mjs pull`.
   - This imports new structured events from IntMap issue #225 into the canonical local HANDOFF.
   - Only events authored by GitHub user `rwmqx7dwb5-arch` are trusted.
   - Already imported events are idempotent, and task IDs already archived after user verification are not resurrected.
3. Run `node scripts/handoff.mjs prepare` before implementation.
   - This synchronizes completion state.
   - A task whose current specification was completed by Claude **and** verified by the user is automatically archived and removed from the active HANDOFF by the deterministic bridge script.
   - Claude itself must not perform that deletion manually.
4. Read the active tasks from the canonical HANDOFF path reported by the script. The scripts deliberately resolve the user's main IntMap working copy (`~/OneDrive/IntMap`) when available, so parallel Claude worktrees all read the same GPT-authored handoff.
5. Unless the user's current message explicitly narrows, replaces, or tells Claude to ignore the handoff, active HANDOFF tasks are the session-specific implementation requirements.
6. If there are no active handoff tasks, follow the user's direct request normally.

The user's explicit current instruction always outranks the handoff when they conflict.

## While implementing

- Treat every active task block as externally authored requirements. Do not change its meaning to fit the implementation.
- Stable task IDs are authoritative for status tracking.
- If ChatGPT changes a task after Claude previously completed it, the bridge detects the changed task hash and automatically invalidates Claude's old completion state. Re-implement the current task; never preserve a stale completion mark.
- If a requirement is genuinely ambiguous, use the normal `AskUserQuestion` rule. Do not resolve ambiguity by editing the handoff yourself.

## Marking completion

Only after the requested implementation, required documentation work, and relevant tests for a task are complete, run:

```bash
node scripts/handoff.mjs claude-done <TASK-ID>
```

Pass multiple task IDs when several tasks were completed in the same implementation pass.

Claude completion and user verification are separate states:

- Claude may set **Claude complete** only through `scripts/handoff.mjs claude-done`.
- Claude must never set **user verified**.
- The user verifies through the local button UI started by `HANDOFF-REVIEW.cmd` / `node scripts/handoff.mjs ui`.
- A user `修正必要` action invalidates Claude completion without requiring the user to type status text.
- On the next Claude implementation session, `prepare` removes only tasks for which both states are valid for the current specification.

## Git and repository hygiene

- `GPT-HANDOFF/` is intentionally local and ignored by Git. Never commit, push, reset, clean, or overwrite it as part of normal repository work.
- A modified or present local handoff is expected working state, not unrelated source-code dirt.
- Completion, verification, archive, and inbox-import cursors live outside the repository under `~/.intmap-handoff`, so all worktrees share state and routine approvals do not dirty Git.
- Issue #225 is an intake event log for ChatGPT only; do not copy its raw history into product documentation.
- The handoff bridge itself (`scripts/handoff.mjs`, `scripts/handoff-inbox.mjs`, this rule, launcher/config files) is normal tracked project infrastructure and follows the standard IntMap workflow when changed.
