# #34 · Make shared/ imports cheap to compile

- State: closed
- Labels: ready-for-agent
- Parent: #23
- Created: 2026-10-18T17:43:55.610Z
- Updated: 2026-10-18T17:43:58.004Z
- Closed: 2026-10-18T17:43:58.004Z

Found while profiling frame compiles (#33): each `shared/` import costs esbuild about 40 ms to resolve and load in a frame compile. A frame with 400 of them takes 19 s, against 95 ms for the same files imported by relative path. On Spool's own canvas esbuild is the largest single cost of a frame compile (25 ms median), so this shows up in every live frame's first load, every booth sitting and every player build.

## Done when

- The cost of a `shared/` import is close to a relative import of the same file, with the design-boundary checks still refusing everything they refuse today.
- Frame documents stay byte-identical for the same inputs.
- Measured against main: per-frame compile time on a copy of Spool's canvas and on spool-bench, time to all covers from nothing, time to first live frame on a page.

*From Linear DEV-133.*

Related: #36, #33, #31

Plane: SPOOL-34

## Comments

### agent, 2026-10-18T17:43:57.995Z

**Liam, 2026-10-02:** **Done, pushed to main (`c92a94eb`..`c66de195`, 2 commits).** Two review rounds plus an adversarial verification (about 440 fast-path answers compared with esbuild 0.28.1, none differed; every design-boundary refusal holds).

Cause: the `shared/` plugin handed each import back through `build.resolve`, and esbuild builds a fresh resolver per call on an uncached file system, listing every folder from `/` down. `src/daemon/shared-import.ts` now answers plain `shared/` imports itself with esbuild's own rules (extension order, folder `index`, the `.js`→`.ts` rewrite, nearest-manifest `sideEffects`), reading folders asynchronously once per compile; anything unusual (symlinks, `..`, suffixes, case mismatch, a folder `package.json`, `browser` fields) still goes to esbuild. 1,940 of Spool's 1,946 `shared/` imports take the fast path (the other 6 are text in a code sample).

Measured against main (3 rounds, load 4 to 11): Spool copy one at a time 30.2 → 20.4 s, three at once 15.9 → 10.0 s, player build 12.4 → 7.0 s; spool-bench unchanged (no `shared/` imports). Documents and player bundles byte-identical, including with Spool's own tsconfig.

Split out: #36 (pre-existing: `shared/` files compile without a tsconfig or package `type` above `design/`).
