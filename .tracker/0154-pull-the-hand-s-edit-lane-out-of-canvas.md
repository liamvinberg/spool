# #154 · Pull the hand's edit lane out of canvas.tsx

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.925Z
- Updated: 2026-10-18T17:44:02.178Z
- Closed: 2026-10-18T17:44:02.178Z

Item 2. Text edit, delete, move and undo into one `use-hand-edit.ts` with one read-before-edit rule.

Plan with line numbers: /tmp/pi-orch/spool-141/notes/cleanup.md (read-only survey, task 141). Behaviour must not change; every existing test keeps passing.

*From Linear DEV-305.*

Related: #153, #148, #147

Plane: SPOOL-154

## Comments

### agent, 2026-10-18T17:44:02.159Z

**Liam, 2026-10-14:** Unblocked: #147, #148 and #153 (the canvas store) are all on main, so this is next in the cleanup order. The plan's line numbers predate the store; re-survey canvas.tsx first.

### agent, 2026-10-18T17:44:02.169Z

**Liam, 2026-10-14:** Built in task 153 (ae9a7eff, 2f062b35), on spool main. src/ui/canvas/use-hand-edit.ts holds words, delete, move, undo and one read-before-edit rule (measured()); canvas.tsx 6630 to 5615 lines. No behaviour change.
