# GPT → Claude handoff protocol

This rule is permanent for IntMap.

## Ownership

- ChatGPT is the semantic editor of the local `GPT-HANDOFF/HANDOFF.md` file.
- The user develops requirements over time by talking to ChatGPT. ChatGPT may merge, rewrite, reorder, split, or remove requirement text as the user's intent develops.
- Claude **must not** directly edit, rewrite, reorganize, simplify, add to, or delete requirement text in `GPT-HANDOFF/HANDOFF.md`.
- Claude must not duplicate the handoff into a second planning/specification document.
- The machine state maintained by `scripts/handoff.mjs` is not a second semantic communication channel; it contains only completion/verification state.

## At the beginning of implementation work

1. Run `node scripts/handoff.mjs init` if the handoff workspace does not yet exist.
2. Run `node scripts/handoff.mjs prepare` before implementation.
   - This synchronizes task state.
   - A task whose current specification was completed by Claude **and** verified by the user is automatically archived and removed from the active HANDOFF by the deterministic bridge script.
   - Claude itself must not perform that deletion manually.
3. Read the active tasks from the canonical HANDOFF path reported by the script. The script deliberately resolves the user's main IntMap working copy (`~/OneDrive/IntMap`) when available, so parallel Claude worktrees all read the same GPT-authored handoff.
4. Unless the user's current message explicitly narrows, replaces, or tells Claude to ignore the handoff, active HANDOFF tasks are the session-specific implementation requirements.
5. If there are no active handoff tasks, follow the user's direct request normally.

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
- The completion state and archive live outside the repository under the user's home directory (`~/.intmap-handoff`) so all worktrees share the same state and routine approvals do not dirty Git.
- Do not add handoff contents to `DEV-NOTES.md`, `Architecture.md`, issues, PR bodies, or another persistent document merely to preserve them. Git history is for product changes; the handoff is disposable implementation input.
- The handoff bridge itself (`scripts/handoff.mjs`, this rule, launcher/config files) is normal tracked project infrastructure and follows the standard IntMap workflow when changed.
