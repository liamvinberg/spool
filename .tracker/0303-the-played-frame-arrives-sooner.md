# #303 · The played frame arrives sooner

- State: open
- Labels: ready-for-agent, enhancement
- Parent: #300
- Blocked by: #301, #302
- Created: 2026-11-11T21:22:56.771Z
- Updated: 2026-11-11T21:22:56.771Z

## Parent

#300

## What to build

The frame shows up sooner after play, in the Mac app and in a browser tab. Use the timing marks from the first ticket (add the same marks for a browser tab) and keep a change only when the marks show it helps.

In the order the scouts ranked them:
1. **Warm on intent.** Start preparing the frame's playable when the pointer shows intent to play (reaching the play control), not only on the canvas-open timer, which today waits and can be pushed back a long way by thumbnail work. A press on a warm frame should find the compile done.
2. **Nothing extra gates the first reveal.** The frame's geometry and the default scenario seed travel with the documents that need them, so the first reveal waits on no separate fetch. Live geometry updates still arrive afterwards and are applied as now.
3. **Shell loads faster.** The outer document preloads the shell and React. The runtime bundles are minified, in the source checkout and in the published build. The real bar is in the first paint of the outer document where that is cheap to do.

Leave alone unless the marks say they cost real time, and say so if you touch them: the arrival motion (the dissolve, the spool mark after a long wait) and the reveal gates that stop wrong-size first paints. They are tuned and have tests for the races they prevent.

## Acceptance criteria

- [ ] Before and after numbers for shell painted and frame revealed, for a warm frame and a cold one, in the Mac app and in a tab, are in the handoff.
- [ ] For a warm frame, the frame is revealed within about 300 ms of the press on the m1. If missed, the handoff says what is left and what it would take.
- [ ] No wrong-size first paint, no flash; the existing reveal and geometry race tests pass.
- [ ] Warming on intent and the reveal without extra fetches are covered by extending the existing play-serve and parity tests.
- [ ] A changeset.
