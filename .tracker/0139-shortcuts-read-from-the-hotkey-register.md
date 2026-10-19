# #139 · Shortcuts read from the hotkey register everywhere (frame shim relay, Mac menu)

- State: closed
- Created: 2026-10-18T17:43:56.764Z
- Updated: 2026-10-18T17:44:01.627Z
- Closed: 2026-10-18T17:44:01.627Z

Make the register in `src/ui/hotkeys.ts` the only place keys are written, so rebinding later is a settings layer on top, not a hunt.

- The frame shim in `src/daemon/document.ts` (the keydown relay near `Esc must still exit`) hardcodes Escape, ctrl+o/i and the zoom chords. Have it relay what the register marks as reaching out of an entered frame (a flag on the entry, e.g. `relay: true`), with the combo grammar from `hotkey-combos.ts`, and the canvas run the register entry by id (canvas.tsx `case "key"`).
- `src/runtime/platform-keys.ts` `accelChord` (player shell) the same.
- The Mac menu in `desktop/src/main.ts` hardcodes accelerators (CmdOrCtrl+N/O/,). Derive them from the register entries (combo to Electron accelerator) so menu and page can't drift.
- Match bracket-like keys by physical key (`event.code`) so ⌘] / ⌘[ sit in the same place on every layout (Swedish: ⌘¨ / ⌘å); the sheet shows the layout's own glyph via `navigator.keyboard.getLayoutMap()` where available.

No user-visible rebinding yet. Blocks the tab keys and live-frame navigation tickets.

From the keybindings grilling in agent-hub task 145. Mac app first: Chrome reserves ⌘W/⌘T/⌘⇧T/ctrl+Tab in a browser tab, so there these commands are reachable from ⌘K only. Every key comes from the one register, `src/ui/hotkeys.ts`, and is told on the ? sheet.

*From Linear DEV-290.*

Plane: SPOOL-139
