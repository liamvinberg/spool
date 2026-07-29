# Process-per-frame isolation: does spool's site-per-subdomain trick actually split renderer processes?

Throwaway prototype. Not committed, not merged. Numbers below are measured, not estimated — every figure traces to `results.json` from one real run.

## Headline finding

**Yes, the split happens, and it is exactly N-vs-constant.** Serving each frame from its own `f<i>.run.spool.localhost` subdomain (behind a new `SPOOL_SITE_SPLIT=1` flag) gives every frame its own Chrome renderer process. Serving them all from the one shared `run.spool.localhost` host — today's behavior — puts all of them in a single renderer process, regardless of count.

| | shared site | per-frame site |
|---|---|---|
| renderer processes at N=4 / 8 / 16 | **3 / 3 / 3** (constant) | **6 / 10 / 18** (= N + 2) |

That process split is also what buys the stall isolation: with one villain frame doing a synchronous 150 ms spin once a second, its 15 siblings stayed at a clean ~43 ms worst-case rAF interval when each was on its own process, and got dragged up to 185–225 ms — the villain's own stall, nearly verbatim — when they all shared one.

The isolation is not free: per-frame sites cost about **151–152 MB of RSS per additional frame** (a whole new renderer process each), against **5–6 MB per additional frame** when frames share one.

## What was tested

- Daemon: this checkout's `dist/cli.js`, started once with `SPOOL_SITE_SPLIT=1`, reused across every configuration below (only the browser was relaunched per configuration, not the daemon).
- Subject: a synthetic spool project, 16 frames, each a plain React component in a sandboxed (`allow-scripts`, no `allow-same-origin`) iframe:
  - 15 "heavy" frames: a self-throttled ~30 fps rAF loop, each tick doing real 2D canvas work (10 layered noise passes: fill an `ImageData` via a fast xorshift32 PRNG, `putImageData` onto a small 200×200 offscreen canvas, `drawImage` upscaled blocky onto the authored 560×560 canvas) — calibrated to ~4.5–6.5 ms of real work per tick.
  - 1 "villain" frame: the same per-tick work, plus a synchronous 150 ms busy-loop once every second.
  - Every frame posts `{spool:"bench-report", frame, p50, p95, worst, ticks}` to its parent every 2 s, describing its own rAF tick-interval distribution.
- Arms: `shared` (every iframe `src` on `run.spool.localhost:<port>`) vs. `per-frame` (iframe *i* on `f<i>.run.spool.localhost:<port>`, same document path either way).
- Counts: 4, 8, 16 (villain always included — it was ordered first, so every prefix slice keeps it).
- Per configuration: fresh **full browser relaunch** (not just a fresh context — see Caveats), staggered inserts (50 ms apart), wait for every frame's `loaded` report, 1 s settle, then a clean **15 s measurement window**, all frames onscreen and live (no freeze/hide treatment).
- Memory: Chrome DevTools Protocol `SystemInfo.getProcessInfo` (real pids, process types) crossed with `ps -o pid=,rss=` for resident size — modeled directly on `bench/frame-cost.ts`'s own instrument.

## 1. Did the split happen? (process counts)

| arm | frames | renderers (floor → held) | total Chrome processes (floor → held) |
|---|---|---|---|
| shared | 4 | 2 → 3 | 6 → 7 |
| shared | 8 | 2 → 3 | 6 → 7 |
| shared | 16 | 2 → 3 | 6 → 7 |
| per-frame | 4 | 2 → 6 | 6 → 10 |
| per-frame | 8 | 2 → 10 | 6 → 14 |
| per-frame | 16 | 2 → 18 | 6 → 22 |

Floor (2 renderers, 6 processes, ~713 MB) is a fresh headless Chrome with nothing mounted yet — reproducible across all 6 independent browser launches (712–715 MB every time), which is a good sign the measurement itself is stable.

Reading the "held" column: shared stays flat at 3 renderers no matter how many frames pile onto the one site. Per-frame tracks frame count exactly — **N + 2** renderers every time (2 baseline + one per frame). That is the proof: Chrome is grouping by hostname (the URL's "site"), not by anything about the frame's opaque sandboxed origin, exactly as the task's premise predicted.

## 2. Memory: shared vs. per-frame

| arm | frames | RSS over floor (total) | RSS / frame |
|---|---|---|---|
| shared | 4 | 230 MB | 57.5 MB |
| shared | 8 | 255 MB | 31.8 MB |
| shared | 16 | 295 MB | 18.4 MB |
| per-frame | 4 | 647 MB | 161.8 MB |
| per-frame | 8 | 1256 MB | 157.1 MB |
| per-frame | 16 | 2466 MB | 154.1 MB |

At 16 frames, per-frame isolation costs **~8.4x** the memory of the shared arm (2466 MB vs. 295 MB over floor).

**Marginal cost of one more frame** (step between counts, same arm):

| arm | step | frames added | MB added | MB per added frame |
|---|---|---|---|---|
| shared | 4 → 8 | 4 | 24.6 | 6.2 |
| shared | 8 → 16 | 8 | 40.1 | 5.0 |
| per-frame | 4 → 8 | 4 | 609.5 | 152.4 |
| per-frame | 8 → 16 | 8 | 1209.8 | 151.2 |

This is the cleanest way to see the trade: adding a 5th, 9th, 13th... frame to the shared site costs ~5–6 MB (just its own DOM/canvas/heap inside an already-running process). Adding one under per-frame isolation costs ~151–152 MB every time — the full weight of a new Chromium renderer process, paid per frame, flat, no economies of scale.

**Illustrative per-process breakdown**, per-frame arm at N=16 (18 renderers): the two pre-existing "spare" renderers sit at 93.7 and 146.2 MB; all 16 new per-frame renderers cluster tightly at **144.7–146.8 MB each**. Shared arm at N=16 (3 renderers): two pre-existing spares (93.8, 134.4 MB) plus **one** renderer at 224.6 MB hosting all 16 frames — bigger than a lone per-frame renderer (more JS/canvas work inside it), but nowhere near 16× bigger, because the frames share one V8 isolate set, one compositor, one everything-but-the-DOM.

## 3. Stall isolation: does a sibling feel the villain's 150 ms spike?

"Siblings" = the non-villain frames in that configuration. Values are each sibling's own self-reported rAF-interval stats aggregated over the 15 s window (mean/max across siblings of each sibling's own max p95 / max worst).

| arm | frames | siblings | sibling p95 mean / max (ms) | sibling worst mean / max (ms) | siblings with worst > 100 ms | villain's own worst (ms) |
|---|---|---|---|---|---|---|
| shared | 4 | 3 | 45.5 / 50.0 | 185.9 / 191.2 | **3 of 3** | 183.1 |
| shared | 8 | 7 | 57.0 / 58.6 | 187.1 / 192.0 | **7 of 7** | 184.2 |
| shared | 16 | 15 | 224.8 / 225.1 | 225.2 / 225.3 | **15 of 15** | 225.2 |
| per-frame | 4 | 3 | 42.1 / 42.2 | 43.0 / 43.1 | **0 of 3** | 183.4 |
| per-frame | 8 | 7 | 42.1 / 42.5 | 45.5 / 50.3 | **0 of 7** | 183.2 |
| per-frame | 16 | 15 | 42.3 / 43.6 | 43.6 / 43.7 | **0 of 15** | 175.1 |

This is the expectation from the task, confirmed exactly: shared-site siblings absorb the villain's stall almost verbatim (183–225 ms worst, essentially indistinguishable from the villain's own 175–225 ms); per-frame siblings stay near the isolated ~42 ms baseline measured separately during calibration, regardless of how many frames are sharing the villain's neighborhood in name only.

One nuance beyond the task's own prediction: in the shared arm, isolation gets *worse*, not just "present," as frame count grows — at 16 frames every single sibling's worst converges to ~225 ms uniformly (all 15 essentially identical), whereas at 4 frames there's some spread (175–191 ms). More frames piled onto one thread means more queued work behind each of the villain's spins, not just the spin itself.

Per-frame, a small number of siblings shows worst up to ~50 ms rather than ~43 ms (e.g., 1 of 7 at N=8) — almost certainly ordinary GC/scheduling jitter within that frame's own process, two orders of magnitude below the shared arm's numbers and nowhere near the villain's 150 ms signature.

## 4. Boot: first insert to all-loaded

| arm | frames | all loaded | onscreen | boot time (ms) |
|---|---|---|---|---|
| shared | 4 | 4/4 | 4 | 221 |
| shared | 8 | 8/8 | 8 | 445 |
| shared | 16 | 16/16 | 16 | 1590 |
| per-frame | 4 | 4/4 | 4 | 222 |
| per-frame | 8 | 8/8 | 8 | 429 |
| per-frame | 16 | 16/16 | 16 | 900 |

Every frame in every configuration reported `loaded`; nothing timed out. At low counts the two arms boot in the same time (dominated by the 50 ms stagger between inserts). At 16 frames, per-frame boots **almost 2x faster** than shared (900 ms vs. 1590 ms) — 16 frames compiling and doing their first render in parallel across 16 processes beats 16 frames contending for one shared main thread, even during boot.

## 5. Host page rAF (context, not the subject)

The host page is a plain `127.0.0.1` static page — a different site from either arm, so it should be insulated from whatever the mounted frames do, and it was:

| arm | frames | host raf p50 / p95 / worst (ms) |
|---|---|---|
| shared | 4 | 8.3 / 10.1 / 10.5 |
| shared | 8 | 8.3 / 10.1 / 10.5 |
| shared | 16 | 8.3 / 10.1 / 10.4 |
| per-frame | 4 | 8.3 / 10.0 / 10.4 |
| per-frame | 8 | 8.3 / 10.1 / 18.6 |
| per-frame | 16 | 8.3 / 10.1 / 16.8 |

Flat and healthy in both arms, as expected — the host's own compositor frame rate never saw either the villain's stall or the shared-thread contention (it's its own process either way). The odd 16–19 ms "worst" blips are single-frame GC/scheduler noise, unrelated to the experiment.

## Every daemon change required

One function, twelve lines, entirely additive and gated behind an env flag read once at daemon construction (`src/daemon/app.ts`):

```diff
 	const controlToken = providedControlToken ?? createCapability();
+	// PROTOTYPE (process-per-frame isolation, throwaway): read once at daemon
+	// construction, never touched again. Off by default so every existing
+	// caller and test sees the exact-match behavior this file always had.
+	const siteSplit = process.env.SPOOL_SITE_SPLIT === "1";
 	const controlHostname = normalizeHostname(controlHost ?? "localhost");
 	...
 		const hostname = normalizeHostname(new URL(url).hostname);
 		if (hostname === controlHostname) return "control";
 		if (hostname === RENDER_HOST) return "render";
+		// PROTOTYPE: every "<anything>.run.spool.localhost" is also a render
+		// host, so each frame can be handed a distinct hostname and (per
+		// Chrome's site-per-precursor-origin rule for opaque sandboxed
+		// origins) a distinct renderer process. Path rules below already gate
+		// purely on `path`, not on which exact hostname classified as render.
+		if (siteSplit && hostname.endsWith(`.${RENDER_HOST}`)) return "render";
 		if (hostname === CAPTURE_HOST) return "capture";
 		return "unexpected";
 	}
```

**Nothing else needed changing**, which was not a given going in — the task explicitly flagged that absolute `run.spool.localhost`-baked URLs in the document, import map, or asset routes might break cross-origin module fetches under a subdomain. Searched and checked empirically (curl across hosts, then a real Playwright-mounted frame):

- The frame document's import map already carries only root-relative URLs (`/vendor/react.js`, `/vendor/spool.js`, ...) — a fetch from `f3.run.spool.localhost/vendor/react.js` resolves against *that* subdomain and hits the same daemon, not a hardcoded `run.spool.localhost`.
- `/vendor/*` and `/vendor/fonts/*` already send `access-control-allow-origin: *` — necessary because sandboxed frames without `allow-same-origin` have an *opaque* origin, so even "same-host" module fetches are cross-origin from the fetch spec's point of view. This was already true for the single shared host and needed no change.
- `/api/p/:project/{scenarios,fixtures}` gate on the literal string `Origin: null` (which every sandboxed opaque-origin frame sends, regardless of which hostname served the document) and answer `access-control-allow-origin: null` — host-independent by construction, not touched.
- The served document's *bytes* are host-independent already — confirmed byte-for-byte identical between `run.spool.localhost` and `f1.run.spool.localhost` in the same run (the compiler's cache key is `root + frame + projectCapability + controlOrigin`, none of which vary with the requesting Host header).
- `src/daemon/document.ts` has no `RENDER_HOST` reference at all — verified by search before touching anything.

Net result: every one of the daemon's existing host-scoped rules (CSP `sandbox allow-scripts` on executable render paths, the render-only path allowlist, the null-origin CORS rules) was already written to key off `path`, not off *which* exact hostname classified as `"render"` — so teaching `hostClass()` to recognize more hostnames as `"render"` was sufficient by itself. Confirmed with all 16 frames booting cleanly on 16 distinct subdomains, zero console errors, zero failed requests, zero HTTP error responses, across all 6 configurations (`results.json`'s `diagnostics` arrays are empty everywhere).

Regression check: full `src/daemon/` test suite (508 tests, 41 files) passes unchanged with the flag off (the default), which is every existing caller and test.

Supporting, non-daemon change: `bench/harness.ts`'s `startDaemon()` gained a 4th optional `extraEnv` parameter (default `{}`) so a bench script can pass `SPOOL_SITE_SPLIT=1` through to the spawned daemon process without touching any existing 3-argument call site (`bench/frame-cost.ts`, etc.).

## Caveats

1. **`chromium-headless-shell` (bench/frame-cost.ts's own default) cannot show this split at all.** Found empirically before running the real numbers above: launching with `channel: "chromium-headless-shell"` runs Chrome in legacy `--headless=old` mode, and a quick 2-iframe smoke test stayed at exactly 1 renderer whether the two iframes were same-site or different-site. Switching to `channel: "chromium"` (the full Chrome-for-Testing binary) in modern headless mode immediately showed the expected split (+1 renderer for a same-site pair, +1 renderer *each* for a different-site pair). Every number in this document was taken with `channel: "chromium"`. Any other spool bench relying on `frame-cost.ts`'s headless-shell default for process-count claims should be treated with this in mind — it may be systematically undercounting renderer processes relative to real desktop Chrome.
2. **Fresh full browser per configuration, not just a fresh context.** The task's spec said "fresh browser context per configuration"; this run relaunches the whole browser (matching `frame-cost.ts`'s own documented reasoning: a closed context does not hand back everything it held). Confirmed necessary empirically: an early version of the pre-flight smoke test reused one browser across arms and saw a leftover renderer process from the previous arm inflate the next arm's count.
3. Six independent floor readings (fresh browser, nothing mounted) landed at 712–715 MB and 2 renderers every time, which is the confidence basis for treating "over floor" as a stable baseline rather than noise.
4. Per-tick canvas work was calibrated once, live, on this machine (~4.5–6.5 ms per tick via a temporary logging build, then removed) — it will differ on other hardware; the mechanism (10 layered noise passes over a 200×200 offscreen canvas, upscaled to 560×560) is what's fixed, not the exact millisecond figure.
5. One daemon process was reused across all 6 configurations (only the browser relaunched each time), started once with `SPOOL_SITE_SPLIT=1` — the shared arm never exercises the flag's new subdomain branch at all (exact hostname match already classified `run.spool.localhost` as `"render"` before this prototype), so its numbers are identical to what today's unflagged daemon would produce.
