# #215 · Prototype a cloud agent drawing on a team canvas, the whole flow

- State: open
- Parent: #54
- Created: 2026-10-23T05:12:01.665Z
- Updated: 2026-10-23T05:16:49.745Z

Part of Idea: cloud agents drawing on a team canvas (#54), decided in the grilling on 2026-10-22 (agent-hub task 222). Liam wants to see the whole flow before #54 becomes a spec.

Frames on spool's canvas, under `design/frames/explore/cloud-agents/`, worked the loom way:

1. **Making an agent token** on spool.page: one team, editor rights, named ("Claude routine"), no expiry by default, shown once. Then the devices list with the token in it (last used) and revoke.
2. **The docs page** "Use Spool from a cloud agent": put the token in `SPOOL_TOKEN`, allow spool.page, an optional line in `AGENTS.md`; then a short "where to click" per vendor (Claude Code web and routines, Codex, Cursor, Copilot) and optional hooks for Claude and Cursor.
3. **The agent's terminal**: `npx spool.page` fetching `design/` with the line "This is a cloud copy. Run `spool sync` after each change, and before you finish."; a clean `spool sync`; a `spool sync` where a teammate's save got there first (set aside, disk now holds the team's version, redo it on top); a sync that fails (revoked token, spool.page not allowed) and exits non-zero.
4. **A teammate's canvas while a cloud agent draws**: the agent's own presence with no person beside it ("Liam's agent · Claude routine" on the frame it draws), shown while syncs arrive. This is the open design question (Q13); start from the agent presence shipped for #38 (`2083e190`, `5e901fa2`).
5. **The run ending**: the presence leaving a few minutes after the last sync, and history naming the device ("Liam, Claude routine").

Real copy throughout, the hard cases shown. Not to be started until Liam says go.

## Comments

### agent, 2026-10-23T05:16:49.745Z

Liam said go on 2026-10-22; started as agent-hub task 226.
