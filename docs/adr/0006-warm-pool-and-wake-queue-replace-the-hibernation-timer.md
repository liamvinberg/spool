# Warm pool and wake queue replace the hibernation timer

The live-frames spike behind #40 overturned the assumption hibernation was built on: frozen iframes cost no CPU (63 frozen frames idle at the same ~120fps as 63 stills — the freeze shim plus Chrome's own off-screen throttling already zero them out), so demoting a frame to its still buys only memory (~4.6MB and a renderer process per iframe realm) and its real price is a ~8ms serialized remount on wake. Hibernation is therefore governed by memory pressure, not time: offscreen frames stay warm in a bounded LRU pool (page-local — the canvas only ever mounts the active page), and overflowing that pool is the only path into hibernation. Every mount drains through a single wake queue capped per sweep — an entered frame starts immediately, the one frozen selection target comes next, then visible frames nearest the viewport center — so zoom and page-entry bursts cannot remount every frame in one commit and drop frames.

## Considered options

A longer grace timer keeps the burst and merely delays it. Memory-API budgets (`performance.memory`, pressure events) are Chrome-only and make lifecycle behavior machine-dependent and untestable. Cross-page warmth would mount frames the page filter deliberately excludes. Fixed counts — pool cap and mounts per sweep — are dumb, deterministic, and tunable.
