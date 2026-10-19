# #143 · ⌘C, ⌘V, ⌘D for frames on the canvas

- State: closed
- Created: 2026-10-18T17:43:56.807Z
- Updated: 2026-10-18T17:44:01.751Z
- Closed: 2026-10-18T17:44:01.751Z

The Pages rail already has copy, paste and duplicate (`sidebar.copy` etc). Give the canvas the same for whole selected frames: ⌘C copies, ⌘V pastes onto the active page near the view's centre (or offset from the source), ⌘D duplicates beside the original. One undo each. Not while a frame is entered or words are being edited; an element held does not change it (element copy is its own feature).

From the keybindings grilling in agent-hub task 145. Mac app first: Chrome reserves ⌘W/⌘T/⌘⇧T/ctrl+Tab in a browser tab, so there these commands are reachable from ⌘K only. Every key comes from the one register, `src/ui/hotkeys.ts`, and is told on the ? sheet.

*From Linear DEV-294.*

Plane: SPOOL-143
