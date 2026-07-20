# live-frames benchmark

- date: 2026-07-20T21:45:13.057Z
- chromium 150.0.7871.125 (playwright, headed) · viewport 1600×1000 · prod build via vite preview
- boot hydrate storm (all 63 frames at once): 63 frames in 407 ms
- self-capture (thumbnail path A): 63 ok / 0 failed in 793 ms total · 63 shots held · samples in capture/self-samples/
- marginal cost of 63 live frames vs all-snapshot: ~4 MB/frame OS memory; renderer count stays flat (no per-iframe process)
- ticks/s column: in-frame rAF activity during the tour. Chrome vsync-locks rAF for visible frames at working zoom (~120/frame), fully pauses offscreen frames (0), but FREE-RUNS frames rendered tiny (overview zoom) at 500–1300 Hz each — reproduced in bare Chrome, not an automation artifact. The lifecycle zoom threshold exists for exactly that regime.

| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all-live | 106 | 16.7 | 36.7 | 12/880 | 14898 | 63/0/0 | 4→5 | 1164 | 3 | 7 | 407 |
| viewport-warm | 110 | 15.1 | 33.4 | 9/913 | 9201 | 0/63/0 | 10→12 | 1344 | 3 | 9 | – |
| viewport-snapshot | 102 | 18 | 41.8 | 21/844 | 6651 | 0/63/0 | 20→12 | 1245 | 3 | 8 | – |
| all-snapshot | 120 | 10.1 | 10.2 | 0/996 | 0 | 0/0/63 | 19→12 | 906 | 2 | 7 | – |
