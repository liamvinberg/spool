# #312 · Canvas top row: Present keeps the corner, the faces move to the top right beside the agent's path, and nothing covers anything

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T09:20:49.524Z
- Updated: 2026-11-12T12:48:07.584Z
- Closed: 2026-11-12T11:24:51.307Z

## What is wrong (spool 0.56.0)

On a deck page (experiment `deck`) the Present button stands at the canvas's top right (`PresentControl`, placed in `src/ui/canvas/canvas.tsx`), where the agent's path stands too (`src/ui/canvas/agent-trail.tsx`, "◌ claude › ica"), so one covers the other. Who else is here (the teammates' faces, `presenceFaces` in `canvas.tsx`) stands at the top left after your own path (`src/ui/canvas/canvas-path.tsx`, its `after`).

## What Liam decided

"i think present corner i already like most as top left should probably be like 'frame' things like searching frames etc, and moving the precense also to top right would be good cause claude also is presence and then present just fits in nicely there aswell".

The design is drawn and is the truth to follow literally: on the team canvas (`design/`, fetched with `pnpm -s dev open .`; read `design/AGENTS.md`, its To build row for spool#311) the frames `app/spool-deck`, `--agent`, `--agent-long`, `--team`, `--team-six`, `--agent-team`, `--narrow`, `--present-menu`, `--arriving` (the motion, plays once) and `app/spool-canvas--trail-crowd` (a page that is no deck), with the row's code in `design/shared/ui/spool/corner-row.tsx`. Read the frames' code for sizes, order, springs and the folding; where this ticket and the frames differ, the frames win.

## The rule, as drawn

- **Top left:** only your path and the search.
- **Top right, one row, left to right:** the agent's path, the faces, then Present in the corner itself (deck pages only). On a page that is no deck the faces take the corner. The faces stand at the top right on every page, in every state they are shown today (also before a project has loaded or when it is empty: check where they stand then and keep them in the same corner).
- **Present never moves or changes size** when an agent starts or stops or a teammate comes or goes. Everything else grows leftward from it.
- **Folding.** The row keeps 24 px clear of the end of your path, 8 px between its parts, and uses the first of these that fits: (1) whole path, up to 4 faces (5 or more people: 3 faces and `+N`); (2) the path with its middle folded (`claude › … › last-part`), up to 4 faces; (3) folded path, up to 3 faces (more: 2 faces and `+N`); (4) the last part cut in its middle when over 20 characters, 9 kept at each end, up to 3 faces; (5) only `◌ claude`, the whole path in its tooltip and still a press to follow, up to 3 faces. Present and your own path never fold and are never covered.
- **Motion.** What is pushed along slides on one spring (0.4 s, no bounce). New parts fade in over 0.26 s from 10 px (path) or 6 px (faces) to the right, and leave over 0.18 s, staying against the right edge while they fade. A new agent path comes in at the row's far left, so nothing moves for it; faces arriving push the path out. When the path changes, its words open leftward. Reduced motion: no slides, fades only.
- Everything the agent's path and the faces do today keeps working where they now stand: following the agent, the outside lines and ask card under the path, follow a teammate from a face, the faces' menu or tooltip, the follow mark.

Build it from the primitives and the theme's roles (`pnpm check` runs the design lint). The folding choice is a pure function of the measured widths: test it there. One browser test proves the wiring: on a deck page with an agent working and teammates here, Present, the faces and the path do not overlap at a wide and at a narrow window, and the faces are not at the top left.

## Leave alone

How Present works (#298, #306), the deck's drag and stage. Two other tasks are changing the Mac app's presenting (#309 a native module, #310 window placing with AeroSpace): stay out of `desktop/`, pull main often.

## Done when

Screenshots of the built row in each of the frames' states, beside the frame's own shot (`pnpm -s dev shot`), saved in `~/.brain-archive/present-corner/` on devobee as one sheet; `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released. A message to task 557 with what was built and what differs from the frames and why, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T11:24:51.307Z

Merged in PR #434 with CI green, not released, patch changeset `canvas-top-right-row`. Screenshot sheet: `~/.brain-archive/present-corner/sheet.png`. Built: `src/ui/canvas/corner-row.tsx` (`levelFor`), `canvas-corner.tsx`, `useAgentTrail` + `trailWords`, and `Faces` with `max`/`align`. The viewer's faces moved to its top right too. Terminal agents' lines hang under the whole row at the corner.

### agent, 2026-11-12T12:48:07.584Z

Merged to main and judged in task 557.
