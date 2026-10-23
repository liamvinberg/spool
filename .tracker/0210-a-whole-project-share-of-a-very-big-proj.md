# #210 · A whole-project share of a very big project settles every page in one request

- State: closed (fixed)
- Labels: ready-for-agent
- Tasks: task 219 (Batch page settling for large shares)
- Created: 2026-10-21T19:14:37.979Z
- Updated: 2026-10-22T18:53:10.186Z
- Closed: 2026-10-22T18:53:10.186Z

Found building #182 (task 205). Creating a whole-project share settles every page inside the one request that makes it, so a very large project could hit the compile object's CPU limit. Pages shares carry the same risk but stop at 100 pages. Settle a whole share's pages in batches after the share is made (or through the 5-minute run), and test with a project of a few hundred pages.

Related: #182, #115

## Comments

### agent, 2026-10-22T18:38:30.898Z

Triage: confirmed. `TeamProjectCompile.share` awaited `settle(fresh)`, compiling every frame of every newly shared page inside the request that made the share; a whole share of a 300-page project is 300+ compiles in one request. The quiet-spell alarm, turn ends with a scenario save (every shared page pending) and a solo upload had the same unbounded shape.

### agent, 2026-10-22T18:53:10.186Z

Fixed in spool-cloud 3324ca2 (merge 219; commits 6e4fc97, 79c3155, 289b711, 2798788). No spool change needed.

- The compile object keeps the shares' pages waiting to settle in a `settle_queue` table. A settling pass compiles at most `SETTLE_COMPILES` (24) frames and settles at most `SETTLE_PAGES` (200) pages. While pages wait, the alarm is set for now, so each later pass runs in its own alarm invocation. The alarm is set before a pass starts, so a pass cut off along with the object still gets finished.
- The request that makes a share runs one pass. The page the share's link opens on (`start`) is settled first, and pages someone asks for go to the front of the queue. A new share, a turn end or a solo upload therefore settles its own pages before it answers, even with a big share's backlog still waiting.
- A page with more frames than one pass compiles is compiled over several passes, using the outputs kept from earlier passes. It settles all at once when the last frame is done, so an outsider never sees part of a page.
- All settling goes through the queue: newly shared pages, the quiet spell, turn ends (one pass for each `heard` call), a scenario save that marks every page, and solo uploads. Pages shares are bounded the same way.
- Review fixes: if a pass fails (its pull, say), the next one waits 30s instead of the alarm ringing again at once. Nothing is written for a share that was stopped or restamped while one of its pages was settling. Saves left waiting from before a restore are lowered to the restored head, so they get settled. Before, they made the alarm ring every time without ever clearing.
- Tests: a whole share of a 300-page project. The request that makes it settles only part of the project, with the start page included. A pages share made while the rest wait settles its own page at once. The alarms then work through all 300 pages. A second test covers a page of 53 frames settling over several passes and never showing partly.
- Checks: typecheck and biome are clean. In the full `pnpm test`, 2 worker tests failed on timeouts under load: the burst-of-saves test and presence. Neither involves shares, and both pass when run on their own. A run before the review fixes had the same kind of timeouts in other files.
- Not covered: the local runtime doesn't enforce CPU limits, so 24 compiles per pass is an estimate (the same as a canvas opening at once), not a measurement. If production logs show the CPU limit being hit, lower it.
