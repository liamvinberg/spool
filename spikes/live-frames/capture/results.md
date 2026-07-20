# live-frames benchmark

- date: 2026-07-20T23:04:29.430Z
- chromium 150.0.7871.129 (playwright, headed) · viewport 1600×1000 · prod build via vite preview
- boot hydrate storm (all 63 frames at once): 63 frames in 447 ms
- self-capture (thumbnail path A): 63 ok / 0 failed in 1149 ms total · 63 shots held · samples in capture/self-samples/
- marginal cost of 63 live frames vs all-snapshot: ~-2 MB/frame OS memory; renderer count stays flat (no per-iframe process)
- ticks/s column: in-frame rAF activity during the tour. Chrome vsync-locks rAF for visible frames at working zoom (~120/frame), fully pauses offscreen frames (0), but FREE-RUNS frames rendered tiny (overview zoom) at 500–1300 Hz each — reproduced in bare Chrome, not an automation artifact. The lifecycle zoom threshold exists for exactly that regime.

| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all-live | 102 | 23.3 | 33.9 | 13/850 | 11997 | 63/0/0 | 40→12 | 1336 | 3 | 7 | – |
| viewport-warm | 104 | 17 | 33.7 | 12/866 | 10600 | 0/63/0 | 23→23 | 1371 | 3 | 9 | – |
| all-warm | 118 | 10.1 | 16.6 | 1/981 | 0 | 0/63/0 | 23→28 | 1317 | 3 | 8 | – |
| viewport-snapshot | 95 | 25 | 41.8 | 25/791 | 9157 | 0/63/0 | 41→30 | 1435 | 3 | 8 | – |
| all-snapshot | 120 | 10.2 | 10.3 | 0/997 | 0 | 0/0/63 | 40→14 | 1079 | 2 | 7 | – |
