# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas — agents author the files, humans arrange and play them.

Run `spool skill` before working here. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `spool skill frames|flows|scenarios|mock|styling|verbs`.

- A frame is born by writing `frames/<name>/frame.tsx` default-exporting one React component — no registration, no `spool new`. Variants are `--`-named siblings (`checkout--empty/`).
- The one law: never write app-owned files — `canvas.json` and `.spool/` are spool's.
- Commit completed design work atomically before handoff.
