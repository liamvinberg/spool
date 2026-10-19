# #140 · Tab keys: ⌘W, ⌘⇧T, ⌘1-9, ctrl+Tab, ⌘⇧[ ], ⌘T

- State: closed
- Blocked by: #139
- Created: 2026-10-18T17:43:56.775Z
- Updated: 2026-10-18T17:44:01.662Z
- Closed: 2026-10-18T17:44:01.662Z

Keyboard for the tab strip (Home + project tabs, `src/ui/app.tsx`, `tab-strip.tsx`).

- ⌘W closes what is on top first (dialog, settings, ? sheet), else the focused project tab. On Home it closes the window. ⌘⇧W always closes the window. In the Mac app the File menu's Close (role close) becomes these.
- ⌘⇧T reopens closed tabs in order, a stack for the session (not across restarts). A tab comes back in its old slot, on its page and camera.
- ⌘1-8 tab N (Home is first), ⌘9 last tab. ctrl+Tab / ctrl+⇧Tab and ⌘⇧] / ⌘⇧[ next and previous, wrapping.
- ⌘T focuses Home.
- Works while a frame is entered (menu accelerators fire before the page in Electron).

Needs the register ticket first.

From the keybindings grilling in agent-hub task 145. Mac app first: Chrome reserves ⌘W/⌘T/⌘⇧T/ctrl+Tab in a browser tab, so there these commands are reachable from ⌘K only. Every key comes from the one register, `src/ui/hotkeys.ts`, and is told on the ? sheet.

*From Linear DEV-291.*

Plane: SPOOL-140
