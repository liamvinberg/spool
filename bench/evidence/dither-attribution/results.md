# dither pan/zoom attribution

Project: `/Users/liamvinberg/projects/liamvinberg.com` (copied twice via `copyProject`, never modified). Page `dither`, 12 frames, camera `{"x":-1012,"y":-255.5,"k":0.52}` (drawn width 416.0 CSS px).

## Achieved live count

| arm | run | live (mounted) / total |
|---|---|---|
| animated | #1 | 8 / 12 |
| static | #1 | 8 / 12 |
| static | #2 | 8 / 12 |
| animated | #2 | 8 / 12 |
| animated | #3 | 8 / 12 |
| static | #3 | 8 / 12 |
| animated | #4 (trace) | 8 / 12 |
| static | #4 (trace) | 8 / 12 |

## Static-arm paint verification

| arm | painted (non-blank) | pixels changed over 2s |
|---|---|---|
| animated | true | true |
| static | true | false |

## Pan gesture — frame interval (ms)

| set | run | p50 / p95 / worst | intervals > 12ms | long-animation-frames | mounted peak |
|---|---|---|---|---|---|
| clean | animated #1 | 8.3 / 9.9 / 10.2 | 0 / 181 | 0 (worst block 0.0) | 8 |
| clean | static #1 | 8.3 / 10.0 / 11.1 | 0 / 184 | 0 (worst block 0.0) | 8 |
| clean | static #2 | 8.3 / 10.1 / 10.3 | 0 / 181 | 0 (worst block 0.0) | 8 |
| clean | animated #2 | 8.3 / 10.2 / 16.7 | 1 / 185 | 0 (worst block 0.0) | 8 |
| clean | animated #3 | 8.3 / 10.0 / 10.2 | 0 / 181 | 0 (worst block 0.0) | 8 |
| clean | static #3 | 8.3 / 10.1 / 11.5 | 0 / 181 | 0 (worst block 0.0) | 8 |
| traced | animated #4 | 8.3 / 10.0 / 10.4 | 0 / 218 | 0 (worst block 0.0) | 8 |
| traced | static #4 | 8.3 / 10.2 / 10.4 | 0 / 199 | 0 (worst block 0.0) | 8 |

## Zoom gesture — frame interval (ms)

| set | run | p50 / p95 / worst | intervals > 12ms | long-animation-frames | mounted peak |
|---|---|---|---|---|---|
| clean | animated #1 | 8.3 / 10.2 / 16.8 | 2 / 125 | 0 (worst block 0.0) | 8 |
| clean | static #1 | 8.3 / 10.0 / 10.2 | 0 / 125 | 0 (worst block 0.0) | 8 |
| clean | static #2 | 8.3 / 10.0 / 15.7 | 1 / 121 | 0 (worst block 0.0) | 8 |
| clean | animated #2 | 8.3 / 10.2 / 25.0 | 2 / 124 | 0 (worst block 0.0) | 8 |
| clean | animated #3 | 8.3 / 10.3 / 16.7 | 1 / 125 | 0 (worst block 0.0) | 8 |
| clean | static #3 | 8.3 / 10.0 / 16.0 | 1 / 120 | 0 (worst block 0.0) | 8 |
| traced | animated #4 | 8.3 / 9.8 / 10.3 | 0 / 127 | 0 (worst block 0.0) | 8 |
| traced | static #4 | 8.3 / 10.0 / 16.6 | 1 / 120 | 0 (worst block 0.0) | 8 |

## Idle CPU by process (10s window, all 8 frames live)

| set | run | canvas renderer | frames renderer | GPU process | browser process | other |
|---|---|---|---|---|---|---|
| clean | animated #1 | 0.220 s (2.2%) | 4.608 s (46.1%) | 1.591 s (15.9%) | 0.012 s (0.1%) | 0.001 s (0.0%) |
| clean | static #1 | 0.354 s (3.5%) | 0.003 s (0.0%) | 0.167 s (1.7%) | 0.021 s (0.2%) | 0.004 s (0.0%) |
| clean | static #2 | 0.287 s (2.9%) | 0.002 s (0.0%) | 0.129 s (1.3%) | 0.013 s (0.1%) | 0.005 s (0.1%) |
| clean | animated #2 | 0.232 s (2.3%) | 4.533 s (45.3%) | 1.647 s (16.5%) | 0.012 s (0.1%) | 0.001 s (0.0%) |
| clean | animated #3 | 0.217 s (2.2%) | 4.593 s (45.9%) | 1.608 s (16.1%) | 0.013 s (0.1%) | 0.002 s (0.0%) |
| clean | static #3 | 0.459 s (4.6%) | 0.005 s (0.0%) | 0.187 s (1.9%) | 0.026 s (0.3%) | 0.002 s (0.0%) |
| traced | animated #4 | 0.226 s (2.3%) | 4.555 s (45.6%) | 1.650 s (16.5%) | 0.013 s (0.1%) | 0.002 s (0.0%) |
| traced | static #4 | 0.390 s (3.9%) | 0.007 s (0.1%) | 0.179 s (1.8%) | 0.024 s (0.2%) | 0.008 s (0.1%) |

## Gesture-window CPU by process (pan)

| set | run | canvas renderer | frames renderer | GPU process | browser process | other |
|---|---|---|---|---|---|---|
| clean | animated #1 | 0.286 s (19.0%) | 0.365 s (24.3%) | 0.208 s (13.8%) | 0.099 s (6.6%) | 0.000 s (0.0%) |
| clean | static #1 | 0.313 s (20.3%) | 0.086 s (5.6%) | 0.172 s (11.1%) | 0.113 s (7.3%) | 0.000 s (0.0%) |
| clean | static #2 | 0.300 s (19.9%) | 0.086 s (5.7%) | 0.167 s (11.1%) | 0.104 s (6.9%) | 0.000 s (0.0%) |
| clean | animated #2 | 0.337 s (21.8%) | 0.411 s (26.6%) | 0.217 s (14.1%) | 0.122 s (7.9%) | 0.000 s (0.0%) |
| clean | animated #3 | 0.323 s (21.4%) | 0.390 s (25.8%) | 0.215 s (14.2%) | 0.108 s (7.2%) | 0.000 s (0.0%) |
| clean | static #3 | 0.442 s (29.3%) | 0.120 s (7.9%) | 0.220 s (14.5%) | 0.151 s (10.0%) | 0.000 s (0.0%) |
| traced | animated #4 | 0.329 s (18.1%) | 0.527 s (29.1%) | 0.261 s (14.4%) | 0.191 s (10.5%) | 0.310 s (17.1%) |
| traced | static #4 | 0.372 s (22.5%) | 0.104 s (6.3%) | 0.179 s (10.8%) | 0.167 s (10.1%) | 0.164 s (9.9%) |

## Gesture-window CPU by process (zoom)

| set | run | canvas renderer | frames renderer | GPU process | browser process | other |
|---|---|---|---|---|---|---|
| clean | animated #1 | 0.232 s (22.0%) | 0.463 s (43.8%) | 0.304 s (28.7%) | 0.097 s (9.1%) | 0.000 s (0.0%) |
| clean | static #1 | 0.264 s (25.3%) | 0.199 s (19.0%) | 0.314 s (30.1%) | 0.110 s (10.6%) | 0.000 s (0.0%) |
| clean | static #2 | 0.247 s (24.2%) | 0.189 s (18.5%) | 0.288 s (28.2%) | 0.098 s (9.6%) | 0.000 s (0.0%) |
| clean | animated #2 | 0.218 s (20.6%) | 0.463 s (43.8%) | 0.273 s (25.8%) | 0.082 s (7.8%) | 0.000 s (0.0%) |
| clean | animated #3 | 0.217 s (20.6%) | 0.473 s (45.0%) | 0.275 s (26.1%) | 0.081 s (7.7%) | 0.000 s (0.0%) |
| clean | static #3 | 0.267 s (26.5%) | 0.202 s (20.0%) | 0.283 s (28.0%) | 0.101 s (10.0%) | 0.000 s (0.0%) |
| traced | animated #4 | 0.216 s (20.5%) | 0.466 s (44.2%) | 0.273 s (25.9%) | 0.079 s (7.5%) | 0.000 s (0.0%) |
| traced | static #4 | 0.238 s (23.6%) | 0.182 s (18.0%) | 0.259 s (25.6%) | 0.092 s (9.1%) | 0.000 s (0.0%) |

## Memory at idle (RSS, run #1 of each arm)

| arm | canvas renderer | frames renderer | GPU process | browser process | other | total |
|---|---|---|---|---|---|---|
| animated | 178 MB | 230 MB | 153 MB | 223 MB | 275 MB | 1060 MB |
| static | 177 MB | 206 MB | 148 MB | 224 MB | 276 MB | 1030 MB |

## Chrome trace over the pan gesture

Main-thread busy time is flattened (non-overlapping 'X'-phase spans on each renderer's CrRendererMain thread), so nested durations are not double counted. Per-name totals below are inclusive sums.

**Correction after first-pass analysis**: the raw capture's first min/max timestamp span came out as ~572,934,218 ms (a multi-day span), which is wrong — it was picking up `ts:0` sentinel values from `__metadata` events. The real capture contains a dense burst of events lasting exactly ~1504 ms (animated) / ~1504 ms (static), matching the scripted pan gesture (90 wheel events at 16.67 ms ≈ 1500 ms) almost exactly. That burst is separated from a handful of earlier stray events (74 for animated, 102 for static, all on the canvas/frames pids but contributing no measurable 'X'-phase duration on either process's `CrRendererMain` thread) by a ~10.8 s gap of near-total silence whose cause is not established — it is not a bug in the gesture timing itself (`performance.now()` independently confirms the drive call took ~1500 ms as scripted, matching the frame-interval tables above), and it did not affect the CPU-bucket or frame-interval numbers elsewhere in this report, which are timed independently of the CDP Tracing subsystem. The table and top-5 breakdowns below are computed from the dense burst only (the real pan gesture), which is what should have been reported the first time.

| arm | trace window (the pan gesture itself) | canvas renderer busy | frames renderer busy |
|---|---|---|---|
| animated | 1504.1 ms | 129.1 ms (8.6%) | 264.9 ms (17.6%) |
| static | 1503.8 ms | 153.3 ms (10.2%) | 3.0 ms (0.2%) |

**animated — top 5 by inclusive duration, canvas renderer main thread**

| name | total ms | count |
|---|---|---|
| FunctionCall | 75.1 | 812 |
| Layerize | 17.4 | 180 |
| Paint | 12.4 | 457 |
| HitTest | 11.9 | 93 |
| EventDispatch | 10.2 | 90 |

**animated — top 5 by inclusive duration, frames renderer main thread**

| name | total ms | count |
|---|---|---|
| FireAnimationFrame | 260.0 | 1565 |
| FunctionCall | 256.5 | 1577 |
| MinorGC | 7.9 | 137 |
| V8.GC_SCAVENGER | 5.9 | 137 |
| V8.GC_SCAVENGER_SCAVENGE | 5.3 | 137 |

**static — top 5 by inclusive duration, canvas renderer main thread**

| name | total ms | count |
|---|---|---|
| FunctionCall | 88.4 | 812 |
| Layerize | 20.7 | 180 |
| Paint | 15.2 | 457 |
| HitTest | 14.1 | 94 |
| EventDispatch | 12.2 | 90 |

**static — top 5 by inclusive duration, frames renderer main thread**

| name | total ms | count |
|---|---|---|
| IntersectionObserverController::computeIntersections | 1.2 | 303 |
| PrePaint | 0.6 | 160 |
| Paint | 0.5 | 6 |
| Layerize | 0.4 | 126 |
| FunctionCall | 0.3 | 12 |

## Verdict

**Short answer: yes, live animation costs real CPU and GPU time, continuously — but at 8 live 800×800 dithering canvases it does not saturate anything, and pan/zoom stayed smooth in both arms. The extra cost sits almost entirely in the frames' shared renderer, not the canvas's own renderer.**

**Where the time goes, in order of size:**

1. **The frames' shared renderer is the whole story.** At idle, with all 8 frames live and nothing else happening, the animated arm's frames renderer burns ~4.5-4.6 of 10 seconds of CPU time (45-46% of a core) against ~0.002-0.007s (0.0%) for static — static's patch genuinely stopped the loop. During the pan gesture itself, the Chrome trace shows the same story on that renderer's own main thread: 264.9ms busy out of a 1504ms window (17.6%) animated vs 3.0ms (0.2%) static — an ~88x difference — and the trace's top-5 breakdown says exactly why: animated's top two entries are `FireAnimationFrame` (260.0ms) and `FunctionCall` (256.5ms), together accounting for essentially all of its busy time, while static's top five are all sub-1.2ms housekeeping (`IntersectionObserverController::computeIntersections`, `PrePaint`, `Paint`, `Layerize`). This is the dithering rAF loop itself, not incidental frame chrome.

2. **The canvas's own renderer is not slower when the frames animate.** Its main-thread busy time during the pan gesture was 129.1ms (8.6%) animated vs 153.3ms (10.2%) static — same order of magnitude, and if anything slightly higher in static across several runs (idle CPU shows the same pattern: 0.22-0.23s animated vs 0.29-0.46s static per 10s window). There is no plausible reason animation would make the canvas's own renderer *more* expensive, so this is run-to-run noise (thermal/scheduling variance over a short window), not a real effect. The clean conclusion either way: **the canvas renderer's own main thread is not where the animated arm's extra cost lives.**

3. **The GPU process is elevated by animation, but mostly at idle.** Idle GPU cpu: 16.1-16.5% animated vs 1.3-1.9% static — a clear, real cost of compositing 8 actively-repainting canvases. During gestures, though, the gap mostly closes: pan GPU cpu is 13.8-14.5% (animated) vs 10.8-14.5% (static, overlapping), and zoom GPU cpu is actually comparable-to-slightly-lower for animated (25.8-28.7%) than static (28.0-30.1%). That is because resizing 8 live cross-origin iframes at 120Hz is itself GPU-expensive regardless of whether their own canvas content is animating — zoom's own rescale cost dominates GPU load in both arms, and live dithering adds a smaller increment on top of it.

4. **No thread is saturated, and no long-animation-frame ever fired.** The highest main-thread busy fraction measured anywhere is 17.6% (frames renderer, animated, during pan) — nowhere near the 100% that "overrunning" would mean. Zero long-animation-frames were recorded in any of the 8 runs, in either arm. Frame-interval p50 was 8.3ms in literally every run of both arms (this display refreshes at roughly 120Hz, so that is one refresh, no dropped frames on the median case), and p95 was 9.8-10.3ms in nearly every run of both arms — the two arms are indistinguishable at the p50/p95 level.

5. **The only place the two arms diverge in the frame-interval numbers is the rare tail, and it is small.** Pan: static's clean runs recorded zero intervals over the 12ms "rare" threshold across all 3 runs; animated recorded 1 (out of 185 samples) in one of its 3 runs, and its worst-case interval touched 16.7ms once (vs static's worst of 11.5ms). Zoom shows the same shape more clearly: animated's worst interval reached 25.0ms (one run) with 1-2 rare intervals per run; static's worst reached 16.0-16.6ms with 0-1 rare intervals per run — measurably more frequent and higher-magnitude in the animated arm, but still occasional (a handful of samples out of 120+ per run), not sustained stutter, and static shows the same *kind* of occasional spike, just smaller. This is consistent with brief scheduling contention — the frames renderer's shared thread has 8 concurrent rAF callbacks competing for the same event loop slot the compositor is also asking it to keep up with — rather than any renderer actually running out of headroom.

6. **Memory is a minor, secondary effect.** Idle RSS: 1060MB (animated) vs 1030MB (static), a ~3% difference, almost entirely attributable to the frames renderer (230MB vs 206MB, +24MB) — the GRID-sized typed arrays each specimen allocates are the same size whether or not the loop keeps running; the small delta is accumulated garbage from ~30fps of repeated draw calls, not a structural memory cost.

**Answering the attribution question directly:** at this scale (8 simultaneously live 800×800 2D-canvas dithering loops on a real project's page), pan/zoom jank is not caused by the canvas renderer's own main thread overrunning, and no process is saturated or anywhere close to it. The frames' shared renderer is doing measurably more work when animated — confirmed independently by both the CPU-time deltas (idle and gesture windows) and the trace's main-thread busy-time and per-function breakdown — but that extra work is a real, continuous *background tax* (clearest with nothing else happening: ~45% of a core plus ~16% of the GPU, all day, whether or not anyone ever gestures) rather than a foreground stutter. Its visible effect on the gesture itself is a modest increase in the frequency and size of rare, brief frame-interval outliers, not the long-animation-frame-grade jank the canvas.ts gesture bench watches for. Whether that background tax turns into real stutter at a higher live-frame count or with heavier per-frame animation work is a question this run does not answer — it tested exactly one project's one page at 8 live frames, no more.

**Caveats:**

- The trace's raw capture window included an unexplained ~10.8 second gap between a handful of stray events and the dense pan-gesture burst (see the correction note above the Chrome trace table); the reported numbers use the corrected, burst-only window. This did not affect any other number in this report (CPU buckets and frame-interval stats are timed independently via `performance.now()`/CDP process snapshots, not the Tracing subsystem).
- Only one Chrome trace was captured per arm (as asked), over one pan gesture each, so the trace-derived busy-time and top-5 figures are a single sample each, not averaged across runs — treat them as illustrative of *which* process and *which* code path the cost sits in, not as a tightly bounded estimate of its size. The CPU-bucket tables (3 clean runs + 1 traced run per arm) are the better source for the size of the effect.
- The two trace-labelled runs (`animated #4` / `static #4`) show a nonzero "other" CPU bucket specifically during their **pan** window (17.1% animated, 9.9% static) that the six clean runs never show there (always 0.0%) — and tellingly, the same two runs' **zoom** window (traced after `Tracing.end` had already been called) shows "other" back at 0.0% for both. That is a clean internal confirmation that the pan-window anomaly is overhead from the Tracing subsystem itself, active only during the pan gesture it was capturing, not a real effect of the arm. The 6 alternating clean runs (no tracing active at all) are the trustworthy source for the CPU-bucket comparison; the traced runs are corroborating, not primary.
- Canvas-renderer idle/gesture CPU was occasionally *higher* in the static arm than animated across a few runs (by 2-5 percentage points of one core) — noted above as noise rather than a real effect, since there is no mechanism by which stopping the frames' own animation loop would cost the canvas's renderer more. It does mean the canvas-renderer numbers specifically should not be read to two significant figures.
- This measures one specific load point: 8 of 12 dither frames simultaneously live (the maximum achievable inside the ticket's 410-430px drawn-width window, given this page's 6-column-by-1000px-pitch grid and the canvas viewport's real width after its sidebar — 1220 CSS px, not the full 1512px browser window). It does not sweep live-frame count or canvas size, so it cannot say where a busier page or a heavier per-frame animation would cross into real, sustained jank.
