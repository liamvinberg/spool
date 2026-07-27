# Warm pool and wake queue replace the hibernation timer

**Superseded in full by [#112](https://github.com/liamvinberg/spool/issues/112).** Both mechanisms this
ADR introduced are deleted: mounting is caused rather than scheduled, so there is no queue to drain,
and being on screen stops holding a document, so there is no pool to bound. Three of its four numbers
were measured wrong ([#85](https://github.com/liamvinberg/spool/issues/85),
[#94](https://github.com/liamvinberg/spool/issues/94)): a mounted frame is ~16 MB unpainted and ~25 MB
painted rather than ~4.6 MB, every mounted frame shares **one** renderer process rather than owning
one, and waking a hibernated frame costs ~110 ms rather than ~8 ms — the figure the drain rate was
sized against. Its fourth claim is confirmed exactly: a frozen iframe costs no CPU. Note that two ADRs
share the number 0006.

The text below is kept as written, as the record of what was believed.

---

The live-frames spike behind #40 overturned the assumption hibernation was built on: frozen iframes cost no CPU (63 frozen frames idle at the same ~120fps as 63 stills — the freeze shim plus Chrome's own off-screen throttling already zero them out), so demoting a frame to its still buys only memory (~4.6MB and a renderer process per iframe realm) and its real price is a ~8ms serialized remount on wake. Hibernation is therefore governed by memory pressure, not time: offscreen frames stay warm in a bounded LRU pool (page-local — the canvas only ever mounts the active page), and overflowing that pool is the only path into hibernation. Every mount drains through a single wake queue capped per sweep — an entered frame starts immediately, the one frozen selection target comes next, then visible frames nearest the viewport center — so zoom and page-entry bursts cannot remount every frame in one commit and drop frames.

## Considered options

A longer grace timer keeps the burst and merely delays it. Memory-API budgets (`performance.memory`, pressure events) are Chrome-only and make lifecycle behavior machine-dependent and untestable. Cross-page warmth would mount frames the page filter deliberately excludes. Fixed counts — pool cap and mounts per sweep — are dumb, deterministic, and tunable.
