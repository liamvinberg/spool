# #25 · Land the cover quick wins: encode off the idle queue, settle once, start the next errand at once

- State: closed
- Labels: ready-for-agent
- Parent: #23
- Created: 2026-10-18T17:43:55.520Z
- Updated: 2026-10-18T17:43:57.758Z
- Closed: 2026-10-18T17:43:57.758Z

Three small, independent fixes to today's cover capture. They hold under any outcome of this map and pay off now. Evidence: research 113, section 4.

## 1. Encode off the idle queue

`captureWorkerJs` in `src/daemon/document.ts` encodes with `canvas.toBlob()`. Chromium runs a main-thread JPEG or PNG `toBlob` in idle time and only forces it after `kIdleTaskStartTimeoutDelayMs`, 1000 ms on Mac ([source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/html/canvas/canvas_async_blob_creator.cc)). The capture worker is a 1 px offscreen page sharing a renderer with booting frames and rarely gets idle time: the encode measured p50 23 ms, p90 1000 ms, worst 1823 ms. Encoding through `OffscreenCanvas.convertToBlob()` took the raster stage to p90 138 ms. The worker's CSP stays as it is; no worker thread is needed.

## 2. Settle once

A borrowed frame settles when it arrives (`askArrival`, about 230 ms) and again when the capture asks it to (`CAPTURE_SETTLE_BUDGET_MS`, another 230 ms). When the frame is already in `settled`, request the capture with a settle budget of 0. Together with fix 1, an errand went from 766 / 1817 / 2649 ms (p50 / p90 / worst) to 498 / 631 / 1079 ms.

## 3. Start the next errand when one finishes

`noteErrandShot` frees the slot, and the next errand waits for the 300 ms sweep: slots were 81% busy, idle 125 ms at the median between errands. Run the decision function when an errand resolves.

## Gate

The 200-frame page from no covers to all covers, before and after, interleaved over three rounds: research 113 measured 65 s stock and 50 to 57 s with fixes 1 and 2. Expect fix 3 to take most of the remaining idle time back.

## Public issue

These are product bugs a user could notice ("covers take seconds to appear"). File them on `liamvinberg/spool` before building if Liam approves the wording; the measurements above are safe to publish, the research path is not.

*From Linear DEV-124.*

Related: #31

Plane: SPOOL-25

## Comments

### agent, 2026-10-18T17:43:57.753Z

**Liam, 2026-10-02:** Landed on `main` and pushed in `032808f5`, `396e21f4`, `4bd778f2`, with a patch changeset.

- Encode: `OffscreenCanvas.convertToBlob()` also waits for idle time on a page's main thread (p90 1002 ms), so the worker encodes with `canvas.toDataURL()`, which runs at once: encode p50 4.6 ms, p90 7.1 ms.
- Settle once: the capture skips its settle only when the current document reported its arrival quiet (finite animations done and the DOM still for 120 ms within budget), nothing changed the frame since it loaded, and the errand borrowed it before it loaded. A settle that ran out of budget or threw keeps the full second settle.
- Next errand: the decision runs again the moment a cover lands; a failed capture waits for the sweep so retries are not spent at once.

Gate, n200 from no covers, interleaved: stock 64.8 / 69.5 s, fixed 34.1 / 37.0 s. Covers byte-identical, 200 of 200. Stock had 1 to 5 failed captures in 5 of 9 runs; fixed had none. Reviewed on both axes, two settle holes found and fixed before landing.
