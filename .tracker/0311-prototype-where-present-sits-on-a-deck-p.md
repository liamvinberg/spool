# #311 · Prototype: where Present sits on a deck page, so it never covers the agent's path

- State: closed
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T08:25:59.029Z
- Updated: 2026-11-12T09:20:54.408Z
- Closed: 2026-11-12T09:20:54.408Z

## Why

In spool 0.56.0 the Present button on a deck page stands at the canvas's top right, which is where the agent's path stands too ("◌ claude › ica", `src/ui/canvas/agent-trail.tsx`, with who else is here after it), so one covers the other (screenshots in `~/.brain-archive/present-two-displays/` on devobee: the small one with "claude › ica" under Present, and the one with the page path "presentations › ica" and the search with ⌘K at the top left). Liam: "should we move present top left like inlined like here? or maybe that becomes bloated cause we have precense there etc, so maybe like explore this in spool?"

## What to make

A loom explore round on the question `deck-present-place`, on the team canvas (`design/frames/explore/deck-present-place/`), as live frames. The unit is spool's window on a deck page at its usual size, built from the adopted `app/spool-deck` frames and `design/shared/ui/spool/deck/`. Every take must be playable and show the same states, switchable in the frame: nothing else in the row; an agent working (its path at the top right, also with a long path); teammates here (faces); both at once; a narrow window; a page that is no deck (no Present); and the caret's menu open. Present keeps its look (the button with the caret, as adopted in spool#297); the question is only where it lives and what gives way.

Takes, one bet each (four to five):
- **In the path**, top left, inline after the page's path and the search, as Liam suggested.
- **Top right, and the agent's path gives way**: Present keeps the corner, the agent's path and the faces stand to its left.
- **On the talk itself**: Present belongs to the band of slides (at its head or by the slide held) and moves with the canvas, with a rule for when the band is out of view.
- **At the foot**, centred, as a player's control.
- One of the designer's own.

Judge each take as loom's explore says (check, shot, read the shot), lay them out in one column, add the row to Questions in `design/AGENTS.md`.

## Done when

The takes boot and are judged; a contact sheet of them (one image, each take in its "agent working and teammates here" state, labelled) is saved at `.brain-557/nice/present-place/sheet.png` in task 557's worktree; and the report says, one line per take, its name and its bet, and which one or two to open first and why. Nothing in `src/` changes.

## Comments

### agent, 2026-11-12T08:41:30.021Z

Liam decided before the round finished (2026-11-12): "i think present corner i already like most as top left should probably be like 'frame' things like searching frames etc, and moving the precense also to top right would be good cause claude also is presence and then present just fits in nicely there aswell". So: Present keeps the top right corner; who else is here (the faces) moves from the top left to the top right, beside the agent's path; the top left keeps only your path and the search. The round of five takes was stopped; the one decided arrangement is drawn straight into the app frames instead.

### agent, 2026-11-12T09:20:54.408Z

Decided and drawn into the app frames; the build is #312.
