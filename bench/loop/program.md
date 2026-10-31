# program.md: the spool performance loop

The rules of the loop that experiments spool into its most performant, cleanest state (spool#218, loop thread task 324), adapted from [karpathy/autoresearch](https://github.com/karpathy/autoresearch): one fixed benchmark, one log, small changes, keep only what wins. Every agent and worker in the loop reads this first.

## What survives

The experience is a gate, not a metric. A change that loses any of these is reverted whatever its numbers say:

1. A live frame is a real, interactive TSX document: clicks, inputs, hover, scroll and focus work inside it, and its code ports straight into an app.
2. Animations play and you can feel them: CSS, rAF, canvas, WebGL, at the rate they were written for, in the frame you are looking at.
3. The canvas feels like Figma: pan, zoom and select follow the hand with no hitch, at 120 Hz on the m1.
4. A hand edit lands in the TSX on disk (the hand lane), and what the agent writes shows up without a person doing anything.
5. Walks between frames and the player work as before.
6. No blinks or pops: a frame never flashes empty, a still never jumps, a reload holds its last paint (#253, #145, #150).
7. Nothing a person uses is removed without Liam.

## The scoreboard

`bench/loop/SCOREBOARD.md` holds every row: what it measures, the command, its unit and direction, its noise band, and its current value on main. `bench/loop/ab.ts` runs any row for two or more arms, interleaved, and prints the medians beside the band.

- **Subjects are frozen.** `spool-bench` at `4e30245` (generated, 1449 frames; `node generate.mjs` after checkout) and `spool-real` (Spool's own `design/`, 510 frames, real Tailwind and shared imports), a git snapshot at `a2cd6c0`. On devobee they live in `~/dev/scratch/spool-bench` and `~/dev/scratch/spool-real-324`; on the m1 in `~/dev/scratch/loop218/`. A bench never measures a live canvas.
- **The bench code is fixed** while rows are compared. A change to a bench is its own commit, and every row it touches gets its band measured again before it is used.
- **Noise first.** A row's band comes from an A/A run: the same commit built in two checkouts, measured as two arms, interleaved (`ab.ts --aa`, then `--from <runs> --aa --write-bands`). Until a row has a band it is not used to keep anything. The bands in `bands.json` are the m1's. On the m1 the arms live in `~/dev/scratch/loop218/` (a clone of the public repo, one detached worktree per commit) and the bench code in `~/dev/scratch/loop218/loop` (rsynced from the loop branch); `ab.ts` runs there through `~/.agent-hub/m1/gui env SPOOL_LOOP_SUBJECTS=$HOME/dev/scratch/loop218 node bench/loop/ab.ts ...`.

## One experiment

1. Pick a hypothesis (the list in spool#218, or one the last result suggests). Write its row in `LOG.md` as `running` before touching code.
2. Branch from the loop branch, change the smallest thing that tests it.
3. Build both arms in their own checkouts (`git worktree add --detach`, `pnpm install --frozen-lockfile && pnpm build`), then `node bench/loop/ab.ts --rows <rows> --arms base=<checkout>,cand=<checkout> --rounds <n>`. Rounds are a multiple of the arms; the order rotates each round; the one-minute load is recorded per run.
4. **Keep** only if the target row wins beyond its band, no other row loses beyond its band, and `pnpm test`, `pnpm typecheck` and `pnpm check` pass. Simpler code at equal numbers is a win too (fewer lines, fewer special cases, a workaround deleted). Otherwise **revert**, and log why.
5. A failing gate is a finding, not a retry: log what failed and what it says before trying anything else.
6. Log the result row in `LOG.md` the moment it is decided: UTC time, commit, hypothesis, before and after with the band, kept or reverted, why.

Believe nothing that has not been run. A number quoted without its arm, round count and load is not a result.

## Stages

- **Fast stage, devobee.** Chromium 149 (Playwright 1.61.1, `chromium-1228`) headed under Xvfb, software GL. Shared and often loaded: a run whose load average is above 8 is repeated, not used. Good for direction, daemon and compile rows, memory and anything counted rather than timed.
- **Gate, the m1.** M1 Pro, 120 Hz built-in display, headed, through `~/.agent-hub/m1/gui`. Feel rows (pan, zoom, entry, animation rate, dropped frames) are decided here, as #23's were. Nothing a person would feel is kept on devobee numbers alone.

## What ships when

- **A fix** is a win nobody sees except as speed or smaller code. It merges to main as it is kept, with a changeset when published behaviour changes (`docs/releases.md`).
- **An experiment** is a change a person would notice: when frames hold, how live the wall is, how an edit lands, a new engine. It lands behind a name in `experiments` (`~/.spool/config.json`, `src/ui/experiments.ts`), off by default, and goes on the walkthrough list below. Its old path stays until Liam has tried it and said yes.

## Workers

- One experiment per worker, small enough to finish well inside its time limit (bitustream's loop, task 275, lost workers at 200 to 240 minutes). A worker that would need longer stops at a measured checkpoint and reports.
- A worker gets its own worktree (`worktree: true`) and a daemon lane of its own: `SPOOL_DIR=/tmp/<lane>/state SPOOL_PORT=<free port>`. Never stop the shared 7767 daemon.
- A reviewer reads every change that touches saves, sync, the hand lane or hand edits before it is kept.
- Two timed runs never share a machine at once: on devobee, `flock /tmp/spool-loop-218.lock` around every timed run; on the m1, one run at a time.

## Walkthrough list (for Liam)

Experiments waiting for Liam to try, with the name to switch on and what to look for. Empty until the first one lands.
