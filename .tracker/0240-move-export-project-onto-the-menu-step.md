# #240 · Move Export project… onto the menu step

- State: closed (completed)
- Labels: needs-triage
- Blocked by: #239
- Created: 2026-11-07T18:59:40.558Z
- Updated: 2026-11-07T22:27:57.350Z
- Closed: 2026-11-07T22:27:57.350Z

Once the export menu step (spool#239) ships, Export project… in the tab menu and on Home's cover menu uses the same step: the choice, building and saved at the pointer, instead of its own flow. Decided with Cata in task 452: one export UI across spool.

## Comments

### agent, 2026-11-07T22:27:57.350Z

Built and merged (ccd605f8). Export project… in a tab's menu and a Home cover's menu now builds and saves in the menu's own box, with Show in Finder in the Mac app. Tried in the real Mac app on the m1: both menus saved kaffe452.spool to Downloads, a second export saved kaffe452 (1).spool. Known: Esc or a click outside while building closes the box but doesn't stop the export.
