> Investigation for #132 on the #129 fixed point, measured 2026-07-28.

# Readable-frame pan cost

## Answer

The reported 5-8 ms pan p95 penalty is not present at
`2665510d6561f4f8b79ce71a2b1e621ce2f89024`. Across 20 untraced, balanced pairs, changing the
same `n100` view from 0 to 16 live documents changed pan p95 by -0.050 ms on average. The 95%
paired-bootstrap interval was -0.105 to +0.010 ms, and the largest paired increase was +0.2 ms.

The equivalence target was ±2.5 ms, half the smallest reported old penalty. The interval is inside
that target and excludes the old +5 ms lower edge.

Rare intervals are a separate result. The untraced sample had no picture run over 12 ms and four
of 20 readable runs over 12 ms. Picture runs delivered 203.05 rAF intervals on average; readable
runs delivered 202.80. The four readable worsts were 16.5-17.9 ms. Those intervals were not
traced, so this report does not attribute them.

A separate 50-pair traced sample had 2/50 picture runs and 4/50 readable runs over 12 ms. It is not
pooled with the untraced cost estimate. The extractor deterministically selected the first four
readable rare intervals and their exact picture controls:

| pair | worst, picture -> readable | readable `RasterImplementation::Finish` | readable `WaitForGetOffset` | child-frame renderer main busy | GPU main busy | canvas renderer main busy | Viz compositor busy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 16.6 -> 17.0 ms | 4 / 6.834 ms | 4 / 6.786 ms | 12.322 ms | 11.558 ms | 1.487 ms | 1.571 ms |
| 11 | 10.3 -> 16.6 ms | 1 / 6.025 ms | 1 / 6.013 ms | 7.878 ms | 7.033 ms | 1.206 ms | 0.684 ms |
| 17 | 10.4 -> 16.6 ms | 2 / 7.343 ms | 2 / 7.321 ms | 12.149 ms | 11.942 ms | 0.989 ms | 2.107 ms |
| 33 | 10.3 -> 17.0 ms | 2 / 4.206 ms | 2 / 4.186 ms | 7.914 ms | 9.186 ms | 1.002 ms | 1.306 ms |

All four selected readable intervals contain the same raster synchronization path. Their paired
picture windows contain zero `RasterImplementation::Finish` and zero `WaitForGetOffset` events.
Readable `Display::DrawAndSwap` work was 1-3 calls totalling 0.336-1.353 ms, smaller than the
child-frame renderer and GPU main-thread work in the same windows.

Top-only `DEBUG132` marks identify the canvas renderer. A `FunctionCall` URL for `n100-056`
identifies the other renderer as a child-frame renderer. Process and thread metadata name
`CrRendererMain`, `CrGpuMain`, and `VizCompositorThread`. The defensible attribution is limited to
these four selected intervals: their long window contains child-frame renderer and GPU raster
synchronization work. Pair 3's picture control was also a rare interval, but contained none of
the two named synchronization events. The two traced picture rare intervals and four untraced
readable rare intervals remain “rare intervals,” not attributed raster stalls.

Those names and waits are pinned to Chromium `150.0.7871.187` at revision
`30f6543ae91e6a860e73b76e3216b663b050f4e5`:
[renderer main](https://chromium.googlesource.com/chromium/src/+/30f6543ae91e6a860e73b76e3216b663b050f4e5/content/renderer/renderer_main.cc),
[GPU main](https://chromium.googlesource.com/chromium/src/+/30f6543ae91e6a860e73b76e3216b663b050f4e5/content/gpu/gpu_main.cc),
[Viz compositor thread](https://chromium.googlesource.com/chromium/src/+/30f6543ae91e6a860e73b76e3216b663b050f4e5/components/viz/service/main/viz_compositor_thread_runner_impl.cc),
[`Display::DrawAndSwap`](https://chromium.googlesource.com/chromium/src/+/30f6543ae91e6a860e73b76e3216b663b050f4e5/components/viz/service/display/display.cc),
and
[`RasterImplementation::Finish`](https://chromium.googlesource.com/chromium/src/+/30f6543ae91e6a860e73b76e3216b663b050f4e5/gpu/command_buffer/client/raster_implementation.cc).
The last source defines `Finish` as waiting for the GPU service to execute the command buffer.

## Count and endpoint area

Only paired deltas below are inferential. Absolute p95 ranges came from separate runs and include
normal temporal drift. Areas were recorded before and after the wheel window, not on every rAF.

| live documents | pairs | pan p95 range | paired p95 delta vs 0, mean [95% interval] | endpoint-mean full drawn area | endpoint-mean viewport-intersection area | runs with worst >12 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 20 | 9.7-10.1 ms | baseline | 0 px² | 0 px² | 0/20 |
| 4 | 10 | 9.8-10.1 ms | -0.030 [-0.12, +0.07] ms | 777,600 px² | 777,600 px² | 0/10 |
| 8 | 10 | 9.6-10.2 ms | -0.090 [-0.20, +0.02] ms | 1,555,200 px² | 777,600 px² | 0/10 |
| 16 | 20 | 9.7-10.1 ms | -0.050 [-0.105, +0.010] ms | 3,110,400 px² | 777,600 px² | 4/20 |

None of the tested counts shows the old positive p95 penalty. These points do not establish a
count scaling law or a knee.

At the measured endpoints, count and full mounted area rise together while viewport-intersection
area is 777,600 px² for each live arm. The rAF samples retain mounted count but not names,
rectangles, or intersection area. Endpoint equality is therefore not a through-gesture painting
area control and cannot separate document count from painted area during the pan.

The requested equal-area control is invalid on this subject. Eight documents at
`k = 0.45 * sqrt(2) = 0.636396...` would have the same 3,110,400 px² full area as 16 documents at
`k=0.45`. At the true canvas center, the production live ring admits only four documents at that
zoom: `n100-045`, `n100-046`, `n100-055`, and `n100-056`. The measured endpoint full area is
therefore 1,555,199.999 px² and the endpoint viewport-intersection area is 869,378.751 px².
Forcing another four off-ring documents would change production eligibility, so the diagnostic
makes no performance inference. Count and area remain confounded.

At `k=0.45`, every frame draws 540 CSS px wide. A 400 px threshold admits 16 documents; a 541 px
threshold admits none. The measured 400 -> 541 step leaves p95 equivalent and changes the
untraced rare-interval incidence from 4/20 to 0/20. That is a threshold lever, not evidence that
every rare interval has the traced cause.

The p95 result does not justify a product optimization. Animation remains a separate workload
question tracked in filed issue [#140](https://github.com/liamvinberg/spool/issues/140).

## Animation limitation

`n100` rotates dashboard, feed, CSS-motion, and particle-rAF frames, so this is a fixed mixed
workload. It does not isolate animation cost. No product conclusion here depends on treating the
mixed page as all-animated.

## Valid measurement

The subject is `spool-bench` commit `b73493f98fedc5ba3df6b98273126912601a39d0`;
`generate.mjs` SHA-256 is
`1c22f11f38a539c9d9db6852ea566d16906951bd0a18c9f9ea10d2c325ff77d8`. Source status was clean.
The driver also hashes every path and byte in the full 1,904-file `design/` tree, including ignored
state and thumbnails. Its required tree SHA-256 is
`2047b256d67bc6e4de35bad28d0c56cc43fc5faca277ba81f977e6014bc21d5f`. All 100 `n100` frames
have complete 600/1200/2400 covers.

The build checkout is fixed at `2665510d6561f4f8b79ce71a2b1e621ce2f89024`. The driver rejects
any source status except the exact one-file control patch, then checks the patch, resulting source,
and complete built output:

| control | patch SHA-256 | patched `lifecycle.ts` SHA-256 | complete `dist/` tree SHA-256 |
| --- | --- | --- | --- |
| threshold | `cb321c48b8b699b82c408000a540fb535d9c0bd8d06fdd32c5e1097a13efebf8` | `8320a3ff22ac8e0d80173b75e35099cc15d1368959517f21585e0ae1733947dd` | `fe0601d66d944a5bb4b9f136331522310d12805a595dcdabcc2c424cdc6aec40` |
| scaling | `2010fa2b534103bc4bf1d51801405282d1e912545b69f1e2e3b7641d774b1eac` | `f0e08621fae10c8f9e85b378e6bb2b9d4a84d1adcfdc80f4aa1404bc8c3cffba` | `47f779f93aeb4f8abbc44e6679a32f007a740222f9f2d488a3c636394f7a69fc` |

Each `dist/` tree has 17 files. Its fingerprint covers every relative path, entry type, file byte,
and symlink target using length-prefixed fields. Both controls happen to share `dist/cli.js`
SHA-256 `c0b55ea073f42e4960da791f81455f71b786efbecf4b783e2962725a89f2d660`,
but their complete trees differ because the patched UI assets differ. The driver checks the
complete tree before running and records its hash in every run as well as each file's metadata.

Each arm received one discarded warm-up, then a fresh browser context in alternating AB/BA order.
The camera was reset before every run against the measured 1220 x 901 canvas inside a 1512 x 945
browser viewport at DPR 2. The primary comparisons used `k=0.45`.

One immutable 90-step wheel schedule supplied both CDP dispatch and DOM validation. Its SHA-256 is
`52333faefbba16154ac59593206878be2776264d99e0734ba449fb6d22d22de0`. Events were targeted
16.667 ms apart without awaiting each dispatch. Across accepted untraced main runs, DOM event
spans were 1483.2-1483.5 ms against a 1483.3 ms target; event-gap p95 was 16.8-17.5 ms and the
largest gap was 23.7 ms. Four first attempts, in pairs 3, 6, 7, and 9, were rejected because a run
exceeded an acceptance limit; all four complete pairs passed on attempt 2.

Every result uses a fixed 1700 ms window from the first DOM wheel timestamp. Records retain all 90
normalized timestamps, run identity, browser version, rAF p50/p95/worst and worst-window offsets,
LoAFs, mounted names/counts, before-window frame rectangles, and the mean endpoint full and
viewport-intersection areas. Mounted count stayed exact throughout every accepted run. Mounted
names and camera geometry matched at the two endpoints; the acceptance check also limited endpoint
area drift to 1 px² before storing the mean. No page errors or LoAF entries were recorded.

The browser was headed Google Chrome `150.0.7871.187` on a 120 Hz Apple M1 Pro display. The driver
refuses another browser version. Node was `v26.5.0`.

Several long-lived Playwright, Chrome, and daemon process trees predated this work and appeared
idle. They were not owned or changed. Every browser, daemon, and temporary fixture created by this
harness was closed, and a post-run audit found no harness-owned process.

## Durable evidence

- [`10-readable-frame-pan-cost.ts`](./10-readable-frame-pan-cost.ts) is the strict-TypeScript
  fixed-cadence driver. Its exact SHA-256 in every committed run file is
  `98aefa6f0939465d736916a9b5fbed36d62b9bf96ffa138279677c2f152860f2`.
- [`10-readable-frame-pan-cost-trace.ts`](./10-readable-frame-pan-cost-trace.ts) deterministically
  extracts and validates bounded trace evidence. Its SHA-256 in the slice and summary is
  `f5ddf2eadd52326ed9323414226b5fafd1462482cbb708376a7848474c8e518f`.
- [`../tsconfig.json`](../tsconfig.json) checks the frozen evidence scripts with isolated DOM
  library types while the root Node-only TypeScript project excludes `bench/evidence`.
- [`10-readable-frame-pan-cost.patch`](./10-readable-frame-pan-cost.patch) is the 400-vs-541
  threshold control.
- [`10-readable-frame-pan-cost-scaling.patch`](./10-readable-frame-pan-cost-scaling.patch) adds the
  center-nearest 4/8 cap. Both patches are zero-context diffs pinned to the fixed point, so apply
  them with `--unidiff-zero`.
- [`10-readable-frame-pan-cost.ndjson`](./10-readable-frame-pan-cost.ndjson),
  [`10-readable-frame-pan-cost-count4.ndjson`](./10-readable-frame-pan-cost-count4.ndjson),
  [`10-readable-frame-pan-cost-count8.ndjson`](./10-readable-frame-pan-cost-count8.ndjson), and
  [`10-readable-frame-pan-cost-eligibility.ndjson`](./10-readable-frame-pan-cost-eligibility.ndjson)
  are the untraced measurement and endpoint-geometry records.
- [`10-readable-frame-pan-cost-trace-runs.ndjson`](./10-readable-frame-pan-cost-trace-runs.ndjson)
  holds the separate 50-pair traced run identities and occurrence counts.
- [`10-readable-frame-pan-cost-trace.ndjson`](./10-readable-frame-pan-cost-trace.ndjson) contains
  bounded process/thread metadata, markers, X events, flows, and child-frame URL evidence for the
  first four readable rare intervals and their picture controls. It records both archive and raw
  JSON hashes for all eight selected traces.
- [`10-readable-frame-pan-cost-trace.json`](./10-readable-frame-pan-cost-trace.json) is derived from
  that slice. Normal extraction validates its own output without requiring historical timings.
  `--verify-reported` additionally checks this report's four exact rows, and `--replay-slice`
  verifies the committed slice and summary without the uncommitted raw traces.

A fresh `spool-bench` Git checkout is not enough because `design/.spool` is ignored. Reproduction
requires the exact archived fixture whose full `design/` tree has the SHA-256 above. The driver
checks that tree, the clean tracked/untracked source status, the subject commit, and `generate.mjs`
before starting a daemon.

Recreate fresh fixed-point builds and records:

```sh
export SPOOL_BENCH=/path/to/exact-spool-bench-fixture
EVIDENCE=bench/evidence/readable-frame-pan-cost
SPOOL_BUILD_ROOT="$(mktemp -d)"
export SPOOL_BUILD="$SPOOL_BUILD_ROOT/threshold"

git worktree add --detach "$SPOOL_BUILD" 2665510d6561f4f8b79ce71a2b1e621ce2f89024
git -C "$SPOOL_BUILD" apply --unidiff-zero "$PWD/$EVIDENCE/10-readable-frame-pan-cost.patch"
pnpm --dir "$SPOOL_BUILD" install --frozen-lockfile
pnpm --dir "$SPOOL_BUILD" typecheck
pnpm --dir "$SPOOL_BUILD" check
pnpm --dir "$SPOOL_BUILD" build
node "$EVIDENCE/10-readable-frame-pan-cost.ts"

TRACE_DIR="$(mktemp -d)"
FRESH_RUNS="$TRACE_DIR/trace-runs.ndjson"
FRESH_SLICE="$TRACE_DIR/trace-slice.ndjson"
FRESH_SUMMARY="$TRACE_DIR/trace-summary.json"
DEBUG132_PAIRS=50 DEBUG132_OUTPUT="$FRESH_RUNS" DEBUG132_TRACE_DIR="$TRACE_DIR" \
  node "$EVIDENCE/10-readable-frame-pan-cost.ts"
node "$EVIDENCE/10-readable-frame-pan-cost-trace.ts" \
  --trace-dir "$TRACE_DIR" \
  --runs "$FRESH_RUNS" \
  --slice "$FRESH_SLICE" \
  --summary "$FRESH_SUMMARY"

node "$EVIDENCE/10-readable-frame-pan-cost-trace.ts" \
  --replay-slice "$EVIDENCE/10-readable-frame-pan-cost-trace.ndjson" \
  --summary "$EVIDENCE/10-readable-frame-pan-cost-trace.json" \
  --verify-reported

git worktree remove --force "$SPOOL_BUILD"
export SPOOL_BUILD="$SPOOL_BUILD_ROOT/scaling"
git worktree add --detach "$SPOOL_BUILD" 2665510d6561f4f8b79ce71a2b1e621ce2f89024
git -C "$SPOOL_BUILD" apply --unidiff-zero \
  "$PWD/$EVIDENCE/10-readable-frame-pan-cost-scaling.patch"
pnpm --dir "$SPOOL_BUILD" install --frozen-lockfile
pnpm --dir "$SPOOL_BUILD" typecheck
pnpm --dir "$SPOOL_BUILD" check
pnpm --dir "$SPOOL_BUILD" build

DEBUG132_COMPARISON=count4 node "$EVIDENCE/10-readable-frame-pan-cost.ts"
DEBUG132_COMPARISON=count8 node "$EVIDENCE/10-readable-frame-pan-cost.ts"
DEBUG132_COMPARISON=eligibility node "$EVIDENCE/10-readable-frame-pan-cost.ts"

git worktree remove --force "$SPOOL_BUILD"
rmdir "$SPOOL_BUILD_ROOT"
```

Raw traces are deliberately not committed. The fresh traced sample produced 100 compressed files
totalling 367 MB; exact archive and uncompressed JSON hashes for the eight selected traces are in
the committed slice.

## Limits

- This is one Chrome, GPU, display, machine, and generated workload.
- Absolute timing drifted during the session. Alternating paired deltas are the estimate.
- The 50-pair trace sample is separate from the 20-pair untraced estimate. Trace timings are used
  only for the four selected interval attributions.
- Area and rectangle evidence exists only at the two endpoints, not on every rAF.
- The equal-area 8-vs-16 control is invalid under production ring eligibility.
- Mixed-versus-all-animated cost remains outside this measurement and is tracked by #140.
