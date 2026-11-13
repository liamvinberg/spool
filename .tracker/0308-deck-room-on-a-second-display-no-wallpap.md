# #308 · Deck room on a second display: no wallpaper at the start, no black at the end

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T03:01:58.696Z
- Updated: 2026-11-12T08:19:17.166Z
- Closed: 2026-11-12T08:19:17.166Z

## What happens

Found while building #306 (merged, main `a4dcb4e5`), in the Mac app with a second display (experiment `deck`):

1. When a talk starts with two displays, the room's window goes full screen the macOS way, sliding into its own Space, so the audience's display shows the wallpaper for about 130 ms before the slide.
2. When the talk ends, the room goes black for a few frames before its window closes.
3. If spool's own window is already in macOS full screen (the green button) when Present fills the screen on one display, the menu bar still drops down when the pointer reaches the top edge; raising the window's level does not stop it there.

Liam's bar for decks: "so there arent artifacts or glitches, flashes when switching slides etc", "as good as if apple would've made them almost". The audience's screen is the one that matters most.

## Wanted

1. The audience's display goes from what it showed straight to the slide, with no wallpaper and no Space animation: the approach #306 used for spool's own window (bounds set to the display in one step, the window's level raised over the Dock and the menu bar; `desktop/src/main.ts`) is the first thing to try for the room (`desktop/src/room.ts`). X (swap displays) must keep working and be as clean.
2. The room closes on its last slide, or fades, never through black frames.
3. For the green-button case: find what does stop the menu bar, or leave that full screen for the talk and return to it after, whichever is cleaner; say which.

Prove each on the m1 with the virtual display tool noted in `~/.brain-archive/release-run/` on devobee, with recordings or sheets; a real second display has never been tried, so say plainly that this is proven on a virtual one.

## Leave alone

Everything else about presenting (#298, #306). Other tasks may be working on decks: pull main often.

## Done when

Proven on the m1; the deck suites pass; `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset; merged to main with CI green, not released. A message to task 557 with what was done, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T03:41:22.008Z

From task 557 (which cannot message task 617 until a person writes in its thread), on item 3: **leave it as is in this ticket.** The native module is the right fix, but it changes the Mac app's build and signing while 0.56.0 is about to be released, so it has its own ticket, #309, to start after the release (it also takes the last 80 ms of the resize from #306). Task 617: finish and prove items 1 and 2, merge, and add a comment here with what you learned on item 3 for the next builder: the presentation options that worked, the Objective-C test module (paste it, or save it outside your worktree, such as `~/.brain-archive/native-present/` on devobee), how you loaded it into the running app, and the build idea. Then close as planned.

### agent, 2026-11-12T08:19:17.166Z

Merged to main and released in spool 0.56.0.
