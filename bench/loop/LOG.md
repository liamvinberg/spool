# LOG: the spool performance loop

One row per experiment or finding, written the moment it is decided (`program.md`). Times UTC. Numbers are medians over the rounds named, with the row's band; "load" is the one-minute load average across the runs.

| # | UTC | commit | hypothesis or step | before → after (band) | verdict | why |
|---|---|---|---|---|---|---|
| 1 | 2026-10-31 09:20 | - | infra: pnpm on devobee | `pnpm: command not found` | fixed | Node 26 (installed 2026-10-28) no longer ships corepack, so `~/.local/share/pnpm/bin/pnpm` pointed at a deleted file. Installed corepack 0.36 under `~/.local` and re-enabled its pnpm shim; pnpm 11.5.3 resolves again. |
| 2 | 2026-10-31 09:30 | b8bf90b1 | bench rot: covers never counted as current | every cover-preparing bench waited out its ceiling, then threw | fixed | Since c2800e61 (2026-10-21) the daemon writes a `source` file beside each still; the harness took any extra file as a stale cover. Every bench that prepares covers (canvas, entry, reload, arrival, walk, frame-cost, ...) has been broken on main for ten days. |
| 3 | 2026-10-31 09:40 | a625bbd0 | infra: one runner for every bench | - | done | `SPOOL_BENCH_BUILD` (measure another checkout's dist), `SPOOL_BENCH_EXPERIMENTS` (an arm's experiments) and `SPOOL_BENCH_SEED` (reuse a build's covers: the booth's 5 to 7 minutes paid once per arm and subject) in `bench/harness.ts`; `bench/loop/ab.ts` runs any rows for any arms, interleaved and rotated, load recorded. |
| 4 | 2026-10-31 09:43 | fa330ecc | finding: what devobee can judge | entry flight drawn in 2 frames, idle refresh 50 ms, pan p95 66.7 ms at load 20 to 37 | rule | Headed under Xvfb is SwiftShader at 60 Hz on a machine other tasks load to 37 (a Rust build was running). Feel rows are decided on the m1 only; devobee keeps counted rows (code, memory, live counts, state kept, pixel ratio) and daemon rows. |
| 5 | 2026-10-31 09:44 | fa330ecc | first m1 run, canvas row (n1000, 1x, one round, load 12.6) | pan p95 10.0 ms, worst 17.2, slow 1.1%; zoom p95 10.3, worst 16.8; arrival 133; enter 289; reload 599 | baseline | One round, no band yet: proves the runner works on the gate. |
