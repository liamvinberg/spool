# live-frames benchmark

- date: 2026-07-20T22:51:02.186Z
- chromium 150.0.7871.129 (playwright, headed) · viewport 1600×1000 · prod build via vite preview
- boot hydrate storm (all 63 frames at once): 63 frames in 387 ms
- self-capture (thumbnail path A): 63 ok / 0 failed in 1093 ms total · 63 shots held · samples in capture/self-samples/
- marginal cost of 63 live frames vs all-snapshot: ~1 MB/frame OS memory; renderer count stays flat (no per-iframe process)
- ticks/s column: in-frame rAF activity during the tour. Chrome vsync-locks rAF for visible frames at working zoom (~120/frame), fully pauses offscreen frames (0), but FREE-RUNS frames rendered tiny (overview zoom) at 500–1300 Hz each — reproduced in bare Chrome, not an automation artifact. The lifecycle zoom threshold exists for exactly that regime.

| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all-live | 102 | 17.5 | 40.5 | 17/851 | 12396 | 63/0/0 | 31→8 | 1109 | 3 | 7 | 387 |
| viewport-warm | 103 | 16.8 | 39.9 | 19/857 | 10655 | 0/63/0 | 14→20 | 1298 | 3 | 9 | – |
| viewport-snapshot | 99 | 17.2 | 41.2 | 25/826 | 10590 | 0/63/0 | 36→33 | 1375 | 3 | 8 | – |
| all-snapshot | 118 | 10.3 | 15.9 | 0/976 | 0 | 0/0/63 | 43→13 | 1028 | 2 | 7 | – |
