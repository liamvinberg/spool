# #153 · Hoist the canvas's mirrored state into one store

- State: closed
- Created: 2026-10-18T17:43:56.914Z
- Updated: 2026-10-18T17:44:02.132Z
- Closed: 2026-10-18T17:44:02.132Z

Item 1 of the cleanup plan. canvas.tsx's ProjectCanvas holds about 63 refs and 30 hand-synced `xRef.current = x` mirrors; move them into one external store like camera-store.ts so a change re-renders only its subscribers.

Plan with line numbers: /tmp/pi-orch/spool-141/notes/cleanup.md (read-only survey, task 141). Behaviour must not change; every existing test keeps passing.

*From Linear DEV-304.*

Related: #154

Plane: SPOOL-153

## Comments

### agent, 2026-10-18T17:44:02.123Z

**Liam, 2026-10-14:** Done in task 141: src/ui/canvas/canvas-store.ts (36ca7c1c, e4ea3b04, dec33a54, a6bd23a4, 9f5037af). Mirrors 48 to 15, ref reads 366 to 89.
