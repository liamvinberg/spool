# Warm pool and wake queue replace the hibernation timer

> This is the canvas-lifecycle ADR. A numbering collision also assigned 0006 to
> [the terminal-frame ADR](./0006-terminal-frames-run-real-processes.md). Both
> filenames stay unchanged so existing links keep working.

**Superseded in full by [#112](https://github.com/liamvinberg/spool/issues/112), and still superseded
under [#128](https://github.com/liamvinberg/spool/issues/128).** Both mechanisms this ADR introduced
are deleted. Mounting is caused rather than scheduled, so there is no queue to drain. #128 restores
proximity as one condition for a readable document, but bounds those documents by viewport area
instead of keeping an offscreen pool. Its three cost figures were measured wrong
([#85](https://github.com/liamvinberg/spool/issues/85), [#94](https://github.com/liamvinberg/spool/issues/94)):
a mounted frame is ~16 MB unpainted and ~25 MB painted rather than ~4.6 MB, every mounted frame shares
one renderer process rather than owning one, and waking a hibernated frame costs ~110 ms rather than
~8 ms, the figure the drain rate was sized against. Its CPU premise was wrong too: #112 measured 24
cooperatively frozen iframes at 37.6% idle CPU, against 41.4% live and a 4.2% no-frame floor. Only
the CSS lock reached that floor, at 4.1%. #131 later removed the lock, so held HTML keeps running.
Readable selected HTML remains visible; unreadable held HTML remains behind its still. This remains
evidence against the old warm pool, not the current held behavior.

The text below is kept as written, as the record of what was believed.

---

The live-frames spike behind #40 overturned the assumption hibernation was built on: frozen iframes cost no CPU (63 frozen frames idle at the same ~120fps as 63 stills — the freeze shim plus Chrome's own off-screen throttling already zero them out), so demoting a frame to its still buys only memory (~4.6MB and a renderer process per iframe realm) and its real price is a ~8ms serialized remount on wake. Hibernation is therefore governed by memory pressure, not time: offscreen frames stay warm in a bounded LRU pool (page-local — the canvas only ever mounts the active page), and overflowing that pool is the only path into hibernation. Every mount drains through a single wake queue capped per sweep — an entered frame starts immediately, the one frozen selection target comes next, then visible frames nearest the viewport center — so zoom and page-entry bursts cannot remount every frame in one commit and drop frames.

## Considered options

A longer grace timer keeps the burst and merely delays it. Memory-API budgets (`performance.memory`, pressure events) are Chrome-only and make lifecycle behavior machine-dependent and untestable. Cross-page warmth would mount frames the page filter deliberately excludes. Fixed counts — pool cap and mounts per sweep — are dumb, deterministic, and tunable.
