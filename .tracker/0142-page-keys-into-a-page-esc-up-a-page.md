# #142 · Page keys: ⏎ into a page, Esc up a page, ⌘↓ / ⌘↑

- State: closed
- Created: 2026-10-18T17:43:56.796Z
- Updated: 2026-10-18T17:44:01.727Z
- Closed: 2026-10-18T17:44:01.727Z

- ⏎ with a page object selected goes inside it (as double-click does).
- Esc as the last layer of `canvas.escape` (nothing selected, nothing held) goes up to the parent page, landing with the page object you came out of selected.
- ⌘↓ / ⌘↑ as Finder-style synonyms.
- Told on the ? sheet.

From the keybindings grilling in agent-hub task 145. Mac app first: Chrome reserves ⌘W/⌘T/⌘⇧T/ctrl+Tab in a browser tab, so there these commands are reachable from ⌘K only. Every key comes from the one register, `src/ui/hotkeys.ts`, and is told on the ? sheet.

*From Linear DEV-293.*

Plane: SPOOL-142
