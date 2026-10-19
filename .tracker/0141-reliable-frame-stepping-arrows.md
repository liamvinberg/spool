# #141 · Reliable frame stepping (⌥ arrows)

- State: closed
- Created: 2026-10-18T17:43:56.785Z
- Updated: 2026-10-18T17:44:01.699Z
- Closed: 2026-10-18T17:44:01.699Z

`src/ui/canvas/spatial-navigation.ts` and the `canvas.step` handler in canvas.tsx.

- Stepping back returns to the frame you came from (→ then ← lands where you started), until the selection changes some other way.
- No dead key: when nothing is within `MAX_SPATIAL_DISTANCE`, take the nearest frame in that direction anyway.
- The camera keeps its zoom and only pans to the target (and only if it is not already in view, if that feels better).

From the keybindings grilling in agent-hub task 145. Mac app first: Chrome reserves ⌘W/⌘T/⌘⇧T/ctrl+Tab in a browser tab, so there these commands are reachable from ⌘K only. Every key comes from the one register, `src/ui/hotkeys.ts`, and is told on the ? sheet.

*From Linear DEV-292.*

Related: #144

Plane: SPOOL-141
