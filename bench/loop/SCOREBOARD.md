# Scoreboard

Every row the loop judges by (`program.md`). **main** is fa330ecc measured on the m1 (M1 Pro, 120 Hz, headed Chromium 149), the median of 8 runs: one commit built twice, 4 rounds each, interleaved (2026-10-31, one-minute load 2 to 15). **band** is that A/A run's noise: the gap between the two builds' medians, or half the spread of one build's rounds, whichever is wider (`bench/loop/bands.json`). A change wins a row only beyond its band.

Run any rows: `node bench/loop/ab.ts --rows <ids|all> --arms base=<checkout>,cand=<checkout>[+experiment] --rounds 4`. Redraw or re-band: `node bench/loop/ab.ts --from <runs.jsonl> [--aa --write-bands --markdown]`.

## The rows

- `canvas`: pan and zoom over the 1000-frame page at working zoom, arrival, entry, reload (bench/canvas.ts). `slow_share` is the share of display intervals over 12 ms, a missed frame at 120 Hz.
- `entry`: double-click on the 1000-frame overview to the frame live: the camera's flight and the landing (bench/entry.ts).
- `walk`: click a link inside a live frame to the target's document loaded (bench/walk.ts).
- `reload`: reload of the 200-frame page to every cover on screen decoded, and the booth's covers from nothing (bench/reload.ts).
- `live`: Spool's own player frame live on screen: pan, zoom and idle at k 0.85 and 0.45, Retina (bench/pan-trace.ts).
- `wall`: 20 live animated frames (burn050) and 12 dither frames at the zoom they go live: canvas intervals, frames animating at full rate at rest and while panning, memory per live frame, renderer processes, canvas pixels drawn over pixels shown (bench/live-wall.ts).
- `hand`: hand editing on Spool's home frame: pan and zoom with it live, click to ring, typing to paint, Enter to the file saved (bench/qa-editing.ts).
- `edit`: an agent's write to the TSX of the frame you are in, to its new pixels; state kept across the edit (counter, input, scroll, a rAF animation); the daemon's compile (bench/edit-loop.ts).
- `cold`: a fresh daemon to the canvas ready and its first live frame (bench/edit-loop.ts --measure cold).
- `save`: the requests and the daemon's event loop after a hand save to a shared file (bench/save-busy.ts).
- `cost`: what mounted frames cost the browser, over a bare host page (bench/frame-cost.ts).
- `code`: lines of code and the bundles a person downloads. No noise: any change counts.

| row | unit | better | main | band | runs |
|---|---|---|---|---|---|
| `canvas.pan_p95_ms` | ms | lower | 10.2 | 0.20 | 8 |
| `canvas.pan_worst_ms` | ms | lower | 17.0 | 0.95 | 8 |
| `canvas.pan_slow_share` | % | lower | 2.75 | 1.65 | 8 |
| `canvas.zoom_p95_ms` | ms | lower | 9.95 | 0.40 | 8 |
| `canvas.zoom_worst_ms` | ms | lower | 17.2 | 8.20 | 8 |
| `canvas.zoom_slow_share` | % | lower | 2.04 | 1.24 | 8 |
| `canvas.arrival_p50_ms` | ms | lower | 192 | 35.6 | 8 |
| `canvas.enter_ms` | ms | lower | 281 | 37.0 | 8 |
| `canvas.reload_ms` | ms | lower | 601 | 47.5 | 8 |
| `entry.live_ms` | ms | lower | 186 | 16.7 | 8 |
| `entry.flight_end_ms` | ms | lower | 243 | 7.68 | 8 |
| `entry.flight_p95_ms` | ms | lower | 41.7 | 8.77 | 8 |
| `entry.flight_fps` | fps | higher | 85.2 | 11.8 | 8 |
| `entry.entry_slow_count` | n | lower | 7.75 | 1.25 | 8 |
| `entry.landing_slow_count` | n | lower | 21.8 | 3.00 | 8 |
| `entry.landing_worst_ms` | ms | lower | 26.2 | 5.05 | 8 |
| `walk.same_page_ms` | ms | lower | 53.9 | 5.58 | 8 |
| `walk.cross_page_ms` | ms | lower | 81.8 | 9.20 | 8 |
| `reload.cold_ms` | ms | lower | 406 | 127 | 8 |
| `reload.warm_ms` | ms | lower | 308 | 69.3 | 8 |
| `reload.covers_from_nothing_s` | s | lower | 21.7 | 1.14 | 8 |
| `live.k85_pan_slow_share` | % | lower | 18.4 | 2.30 | 8 |
| `live.k85_zoom_slow_share` | % | lower | 19.6 | 2.10 | 8 |
| `live.k85_idle_slow_share` | % | lower | 35.4 | 4.50 | 8 |
| `live.k45_pan_slow_share` | % | lower | 17.8 | 2.50 | 8 |
| `live.k45_zoom_slow_share` | % | lower | 17.7 | 3.10 | 8 |
| `live.k45_idle_slow_share` | % | lower | 36.8 | 6.90 | 8 |
| `live.k45_pan_p95_ms` | ms | lower | 16.8 | 0.05 | 8 |
| `wall.live_frames_count` | docs | higher | 20.0 | 0.00 | 8 |
| `wall.rest_canvas_p95_ms` | ms | lower | 17.0 | 0.05 | 8 |
| `wall.rest_canvas_dropped_count` | frames | lower | 127 | 97.5 | 8 |
| `wall.rest_frames_full_rate_count` | docs | higher | 9.00 | 0.00 | 8 |
| `wall.rest_frame_raf_median_fps` | fps | higher | 119 | 1.10 | 8 |
| `wall.pan_canvas_p95_ms` | ms | lower | 10.3 | 3.15 | 8 |
| `wall.pan_canvas_dropped_count` | frames | lower | 12.0 | 11.5 | 8 |
| `wall.pan_frames_full_rate_count` | docs | higher | 0.00 | 0.00 | 8 |
| `wall.pan_frame_raf_median_fps` | fps | higher | 1.00 | 0.10 | 8 |
| `wall.mem_per_live_mb` | MB | lower | 14.8 | 0.47 | 8 |
| `wall.frame_renderer_count` | procs | lower | 1.00 | 0.00 | 8 |
| `wall.pixel_ratio` | x | lower | 8.65 | 0.00 | 8 |
| `wall.dither_rest_frames_full_rate_count` | docs | higher | 6.00 | 0.00 | 8 |
| `wall.dither_rest_frame_raf_median_fps` | fps | higher | 108 | 1.19 | 8 |
| `wall.dither_pan_canvas_p95_ms` | ms | lower | 10.4 | 2.75 | 8 |
| `wall.dither_pan_frames_full_rate_count` | docs | higher | 0.00 | 0.00 | 8 |
| `wall.dither_pan_frame_raf_median_fps` | fps | higher | 0.50 | 0.20 | 8 |
| `wall.dither_mem_per_live_mb` | MB | lower | 42.4 | 1.71 | 8 |
| `wall.dither_pixel_ratio` | x | lower | 3.84 | 0.00 | 8 |
| `hand.pan_p95_ms` | ms | lower | 16.6 | 0.20 | 8 |
| `hand.pan_slow_count` | n | lower | 43.5 | 8.50 | 8 |
| `hand.zoom_p95_ms` | ms | lower | 16.7 | 0.10 | 8 |
| `hand.zoom_slow_count` | n | lower | 61.0 | 16.5 | 8 |
| `hand.click_to_ring_ms` | ms | lower | 3.82 | 1.32 | 8 |
| `hand.click_to_rungs_ms` | ms | lower | 12.8 | 1.25 | 8 |
| `hand.caret_ms` | ms | lower | 5.20 | 0.85 | 8 |
| `hand.slow_keys_share` | % | lower | 100 | 2.50 | 8 |
| `hand.enter_to_saved_ms` | ms | lower | 35.0 | 4.50 | 8 |
| `edit.save_to_pixels_ms` | ms | lower | 215 | 55.1 | 8 |
| `edit.save_to_loaded_ms` | ms | lower | 212 | 72.4 | 8 |
| `edit.shared_save_to_pixels_ms` | ms | lower | 261 | 69.0 | 8 |
| `edit.shared_save_to_loaded_ms` | ms | lower | 258 | 72.8 | 8 |
| `edit.state_kept_count` | of 4 | higher | 0.00 | 0.00 | 8 |
| `edit.shared_state_kept_count` | of 4 | higher | 0.00 | 0.00 | 8 |
| `edit.compile_ms` | ms | lower | 23.4 | 6.10 | 8 |
| `edit.shared_compile_ms` | ms | lower | 26.2 | 10.7 | 8 |
| `edit.document_hit_ms` | ms | lower | 2.35 | 0.26 | 8 |
| `cold.daemon_up_ms` | ms | lower | 633 | 7.00 | 8 |
| `cold.canvas_ready_ms` | ms | lower | 1667 | 18.0 | 8 |
| `cold.cold_first_live_ms` | ms | lower | 2904 | 53.2 | 8 |
| `save.flows_after_save_ms` | ms | lower | 201 | 20.5 | 8 |
| `save.rungs_after_save_ms` | ms | lower | 26.6 | 3.91 | 8 |
| `save.selection_after_save_ms` | ms | lower | 20.5 | 3.79 | 8 |
| `save.loop_worst_ms` | ms | lower | 17.1 | 3.20 | 8 |
| `cost.first_frame_mb` | MB | lower | 166 | 1.22 | 8 |
| `cost.live25_mb` | MB | lower | 377 | 2.76 | 8 |
| `cost.live50_mb` | MB | lower | 531 | 9.56 | 8 |
| `cost.live25_cpu_pct` | % | lower | 127 | 1.59 | 8 |
| `cost.offscreen24_cpu_pct` | % | lower | -0.28 | 0.53 | 8 |
| `cost.mount_cold_ms` | ms | lower | 27.7 | 1.15 | 8 |
| `cost.mount_warm_ms` | ms | lower | 16.0 | 0.55 | 8 |
| `code.src_lines` | lines | lower | 138679 | 0.00 | 8 |
| `code.canvas_tsx_lines` | lines | lower | 6072 | 0.00 | 8 |
| `code.canvas_dir_lines` | lines | lower | 46269 | 0.00 | 8 |
| `code.runtime_lines` | lines | lower | 7726 | 0.00 | 8 |
| `code.daemon_lines` | lines | lower | 39859 | 0.00 | 8 |
| `code.ui_js_gzip_kb` | KiB | lower | 565 | 0.00 | 8 |
| `code.ui_css_gzip_kb` | KiB | lower | 27.2 | 0.00 | 8 |
| `code.deps` | pkgs | lower | 13.0 | 0.00 | 8 |

## devobee

Its feel rows are not used (`LOG.md` #4). Its A/A run (load 3 to 27) put even memory and save timings at 5 to 30% bands, and the viewer row's CPU doubled between two copies of one build. So devobee judges only what is counted exactly: `code`, `edit.state_kept_count`, `wall.pixel_ratio`, `wall.live_frames_count`, `wall.frame_renderer_count`. The `viewer` row (spool.page's read-only canvas) reads `/proc` and runs only there; it has no usable band until devobee is quiet.

## What a person must never lose

The experience gate of `program.md`, checked by hand at every kept change a person could notice: live interaction in frames, animations you can feel, the canvas following the hand, hand edits landing in the TSX, walks and the player, no blinks or pops.
