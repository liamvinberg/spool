# #14 · Prototype live cursors and who's looking

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Blocked by: #10
- Created: 2026-10-18T17:43:55.426Z
- Updated: 2026-10-18T17:43:57.443Z
- Closed: 2026-10-18T17:43:57.443Z

## Question

How do people show up to each other on a shared canvas in the first team version? Live cursors, and a view at the top right of who's looking: what a cursor looks like, what the faces at the top right show (someone on another page, someone idle, too many people to fit), and what pressing a face does. Edits are instant and seen live. Agents are out of scope here (re-scoped 2026-10-04, see Idea: how people's agents show up on a team canvas (#38)). Drawn as spool frames under `design/frames/explore/cloud/`, variations as separate frames.

*From Linear DEV-113.*

Related: #29, #38, #63

Plane: SPOOL-14

## Comments

### agent, 2026-10-18T17:43:57.407Z

**Liam, 2026-10-02:** First round drawn, waiting on Liam's reaction.

Twelve frames under `design/frames/explore/cloud/presence/`, all over `design/shared/ui/explore/cloud/team-canvas.tsx`. Four takes down (tethered, members, roster, labels), three states across (overview, following Ana, inside `cart` while Ana's agent writes it). Screenshots: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/presence/

### agent, 2026-10-18T17:43:57.412Z

**Liam, 2026-10-02:** Second round, built around motion, replaces the first. Six animated takes (hand, radar, ghost, scan, leash, orbit) play the same 18-second scene with a scrubber under it. They are frames under `design/frames/explore/cloud/presence/` over `design/shared/ui/explore/cloud/presence-scene.tsx`. Videos: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/presence/

### agent, 2026-10-18T17:43:57.418Z

**Liam, 2026-10-03:** Round three: five designers each worked from a blank page with one lens (places, the work itself, territory, calm, wildcard). That gave 15 takes and 84 animated frames, each shown in the hard cases: a person far from their agent, zoomed out, following, two agents on one frame, coming back. Frames are under `design/frames/explore/cloud/presence-{places,work,territory,calm,wild}/`. Videos of every frame: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/presence-lenses/

Three lenses landed on the same idea independently: a frame is a room, and presence sits on frame names, which don't scale with zoom (plates, rooms, settle). Pointers only show inside a frame you're in. Somewhere off screen gets one edge marker per place, not one per person. Waiting on Liam.

### agent, 2026-10-18T17:43:57.423Z

**Liam, 2026-10-04:** Re-scoped to people only: live cursors and who's looking. Agent presence moved to Idea: how people's agents show up on a team canvas (#38).

There are five cursor takes (chip, fade, mono, dot, avatar), each shown as the base scene, `--follow` and `--crowd`. They're under `design/frames/explore/cloud/cursors/`, over `design/shared/ui/explore/cloud/cursors/live-cursors.tsx`. Videos: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/cursors/

Waiting on Liam's pick.

### agent, 2026-10-18T17:43:57.431Z

**Liam, 2026-10-04:** Liam's direction (2026-10-04), from the motion lens:
- the cursor is Hush's look: a pointer plus a name pill, the pill fading when someone is idle or offline
- the name docks onto a frame only while that person is inside it live
- dragging changes the pointer instead

Drawn as `cursors-motion-live-{hand,move,grip}` (the three ways the pointer can look while dragging), each with `--follow` and `--crowd`. They're under `design/frames/explore/cloud/cursors-motion/`, over `take-live.tsx`, and the engine gained `enters`. The other cursor lenses were committed (74de0145), then removed (37704517). Videos: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/cursors-live/

### agent, 2026-10-18T17:43:57.437Z

**Liam, 2026-10-04:** Resolved 2026-10-04: how people show up on a team canvas in the first version. People only; agents moved to Idea: how people's agents show up on a team canvas (#38).

- **Cursor:** the person's coloured pointer with their name in a pill. The pill shows while they move or press, holds 1.4 s after they stop, then fades. Movement is smoothed with no overshoot.
- **Idle and offline:** idle sinks the pointer to a third of its ink. Leaving fades the person out.
- **Inside a live frame:** the pill docks beside that frame's name for as long as the person is inside. Several people line up there, and an idle one dims. Their pointer stays bare inside the frame. Stepping out flies the pill back to the pointer.
- **Dragging:** the pointer closes into a grabbing hand while the button is held. A frame being moved carries the dragger's selection outline in their colour.
- **Top right:** the faces of who's here. Pressing a face follows that person's view, with an outline in their colour and `following <name> · esc`. The open list shows each person's page, or idle with how long.

Canonical frames: `design/frames/explore/cloud/cursors-motion/cursors-motion-live-hand`, `--follow`, `--crowd` (`take-live.tsx`, `live("hand")`). Videos: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/cursors-live/
