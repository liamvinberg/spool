# live-frames benchmark — react vs vanilla

- date: 2026-07-21T20:09:45.328Z
- machine: Apple M1 Pro · 32 GB
- chromium 150.0.7871.129 (playwright, headed, channel: chrome) · viewport 1600×1000 · prod build via vite preview · fresh browser per variant
- react variant: compiled screen components via import map against one pinned react ESM bundle (single instance, evaluated per frame realm); 22.3 KB minified Tailwind stylesheet (preflight + utilities) inlined per frame document per #15
- ticks/s column: in-frame rAF activity during the tour. Chrome vsync-locks rAF for visible frames at working zoom, fully pauses offscreen frames, but FREE-RUNS frames rendered tiny (overview zoom) — the lifecycle zoom threshold exists for exactly that regime.

## vanilla srcdoc HTML (#8 baseline rerun)

- boot hydrate storm (all 63 frames at once): 63 frames in 338 ms
- self-capture (thumbnail path A): 63 ok / 0 failed in 1031 ms total · 63 shots held

| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all-live | 107 | 16.6 | 33.3 | 8/886 | 14777 | 63/0/0 | 40→12 | 1233 | 3 | 7 | – |
| viewport-warm | 107 | 16.7 | 33 | 5/891 | 14320 | 0/63/0 | 21→16 | 1313 | 3 | 9 | – |
| all-warm | 117 | 10.2 | 16.8 | 0/968 | 0 | 0/63/0 | 27→24 | 1221 | 3 | 8 | – |
| viewport-snapshot | 106 | 16.5 | 34.4 | 18/880 | 11121 | 0/63/0 | 34→22 | 1409 | 3 | 8 | – |
| all-snapshot | 120 | 9.5 | 10.2 | 0/996 | 0 | 0/0/63 | 32→14 | 1005 | 2 | 7 | – |

## react frames (#17)

- boot hydrate storm (all 63 frames at once): 63 frames in 849 ms
- self-capture (thumbnail path A): 63 ok / 0 failed in 1081 ms total · 63 shots held

| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | js heap MB | os mem MB | renderers | procs | hydrate ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| all-live | 107 | 16.5 | 33.6 | 10/892 | 14331 | 63/0/0 | 13→13 | 1407 | 3 | 7 | – |
| viewport-warm | 108 | 16.6 | 33.3 | 6/895 | 12695 | 0/63/0 | 26→26 | 1362 | 3 | 9 | – |
| all-warm | 118 | 10 | 16.5 | 1/976 | 0 | 0/63/0 | 20→25 | 1343 | 3 | 8 | – |
| viewport-snapshot | 102 | 16.9 | 41.6 | 23/851 | 8228 | 0/63/0 | 35→25 | 1560 | 3 | 8 | – |
| all-snapshot | 120 | 9.8 | 10.2 | 0/997 | 0 | 0/0/63 | 35→19 | 1050 | 2 | 7 | – |

## react vs vanilla

- boot hydrate storm: 338 → 849 ms (+511 ms for 63 frames, ~+8.1 ms/frame)
- all-live tour: 107 → 107 fps · p95 16.6 → 16.5 ms · os mem 1233 → 1407 MB
- marginal memory per live frame (all-live minus all-snapshot): 3.6 → 5.7 MB/frame
- self-capture sweep: 1031 → 1081 ms for 63 frames
