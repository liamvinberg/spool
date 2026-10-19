# #2 · Idea: a Spool phone app for trying prototypes like a native app

- State: open
- Created: 2026-10-18T17:43:55.312Z
- Updated: 2026-10-18T17:43:57.089Z

Liam, 2026-10-01: when prototyping a mobile app you want to try it on your phone and have it feel as native as possible, even though it is React in a browser. A Spool phone app could open prototypes for people with a cloud account, and maybe work locally too, for example by AirDropping a file to the phone.

Ruled out of the Spool Cloud map ("Wayfinder map: Spool Cloud for teams"), which keeps only the phone experience of a shared link. Revisit once that has been tried. Evidence: `spool-cloud/research/108-phone-preview/`.

*From Linear DEV-101.*

Related: #3, #16, #53, #62

Plane: SPOOL-2

## Comments

### agent, 2026-10-18T17:43:57.089Z

**Liam, 2026-10-15:** Prototyped in agent-hub task 156, canvas `explore/phone-app` (three takes: shell, dot, follow). Liam picked **dot**: a floating dot like AssistiveTouch, bottom right by default, draggable, sticks to the nearest edge on release and remembers where it was left. Tap opens a strip that steps through the page's frames and a sheet with the navigator (covers, pages a level at a time, find). Saves surface as words from the dot. Borrow follow's "follow my Mac" as a switch in the dot's sheet. The desktop side's QR code shipped with the Share popover in the bar (task 156).
