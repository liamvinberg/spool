# #297 · Deck: what Present does, and choosing one full screen or a presenter view (prototype)

- State: closed
- Labels: ready-for-agent
- Created: 2026-11-11T10:50:47.693Z
- Updated: 2026-11-11T21:02:25.487Z
- Closed: 2026-11-11T21:02:25.487Z

## What Liam asked (task 557, 2026-11-11)

"another is playing immeduately like opens a new window with the presentation and your \"control panel\" like presenter mode, but like figma has so you can choose if you just want maybe one fullscreen maybe from your machine you present for instance." ... "making it so that they feel as good as if apple would've made them almost".

## What this is

A taste call, prototyped before it is built: live takes on the team canvas at `explore/deck-present` (loom explore), for Liam to feel and pick. Today Present always turns spool's window into the presenter view and opens the room as a second window, which on one display is a small window nothing makes full screen; the only control is a triangle on the deck's row in Pages and "play" on a slide's label.

Facts about today's build: `/tmp/brain-557/nice/today.md`. Research on Figma Slides, Keynote, Google Slides and PowerPoint: `/tmp/brain-557/nice/research.md`.

## Done when

Liam has picked. The pick becomes a build ticket; the exploration is deleted the turn the winner is named. Run from task 557.

## Comments

### agent, 2026-11-11T20:37:36.514Z

Liam leaned to the third take, `present-caret` ("i like ... the indicator of cursor on like pages you can interact with ... so maybe third one"), and asked for a recommendation; task 557 recommends it: Present plays at once (full screen on one display, presenter view by itself with two), the other way under the caret, and on one display the last way used is remembered. Being adopted into the `app/spool-deck--present*` frames; the build ticket follows.

### agent, 2026-11-11T21:02:25.487Z

Adopted into `app/` (present-caret, with the last way remembered on one display). The build is #298.
