# #8 · Research: how fast and heavy a live update is

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.371Z
- Updated: 2026-10-18T17:43:57.274Z
- Closed: 2026-10-18T17:43:57.274Z

## Question

How long does it take, and how many bytes move, to get one local frame edit onto another person's screen? Compare compiling on the member's machine and uploading finished files (what the beta does) with uploading source and compiling in the cloud. Measured on Spool's own canvas: compile times and changed bytes after editing one frame, a shared component and the tokens file. Whether esbuild and Tailwind can compile inside a Cloudflare Worker, Durable Object or Container, and whether compiling runs any of the author's code. And what latency people perceive as instant or live, with sources.

Spike, run on Opus. Report: `spool-cloud/research/107-live-update-cost/`.

*From Linear DEV-107.*

Related: #62

Plane: SPOOL-8

## Comments

### agent, 2026-10-18T17:43:57.269Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/107-live-update-cost/` (commit `3e2af5f`), scripts and raw results beside it. Spike run on Opus. The machine was heavily loaded by other agents, so CPU time is the reliable figure, not wall-clock.

- **What moves is small.** A one-line frame edit changes 3 compiled files, about 1 KB compressed; a new Tailwind class adds 4 to 10 KB. A `shared/ui` edit is 6 to 42 KB, because every frame module importing the component changes too (185 KB in one set where the shared chunk carries inlined images). A `tokens.css` edit is 0 to 14 KB. As source, the same edits are 14 to 43 bytes, or 0.2 to 5 KB for the whole file.
- **The exporter is the slow part, not the network.** Today's export costs 3 to 13 s of CPU even for one frame: it compiles the set three times and parses all 751 frames for the readiness check (1.5 s alone). Kept warm, the work an edit actually invalidates is 0.15 to 0.3 s for a frame and 0.7 to 1.1 s for a shared component or tokens. Spool has no warm compile for publications today.
- **Compiling in a Cloudflare Worker works on this canvas.** esbuild-wasm plus Tailwind's JS compiler ran in local workerd and produced byte-identical output to the native tools on all three test sets, at 2 to 3x native CPU (0.7 to 1.1 s warm, 3 to 3.8 s on first use). Bundle about 14 MB, memory an estimated 50 to 70 MB, both inside the limits.
- Tailwind's native class scanner (Oxide) can't run in a Worker, but Spool only needs it to find class names. A 50-line JS replacement matched its CSS on 35 of 35 frames and missed nothing across 1,095 script files. That is evidence on this canvas, not proof it's equivalent in general.
- **Compiling runs none of the author's code.** It uses only Spool's own esbuild plugins, refuses Tailwind `@plugin` and `@config`, and fetched modules are parsed, never run.
- Compiling in the cloud contradicts two recorded decisions: [liamvinberg/spool-cloud#160](https://github.com/liamvinberg/spool-cloud/issues/160) and [liamvinberg/spool-cloud#161](https://github.com/liamvinberg/spool-cloud/issues/161) keep raw TSX on the machine and compilation local, and liamvinberg/spool-cloud#160 says open visits never auto-refresh.
- **Today's update path isn't built for speed.** It makes at least 7 requests in sequence, each with its own Keychain lookup, and sealing and activating a version re-check every object in it, not just the changed ones. A round trip to the Stockholm edge is 5 to 20 ms.
- **Perception thresholds:** about 0.1 s feels instant and about 1 s keeps flow (Nielsen, after Miller and Card). Vite hot reload is under 50 ms; React Native Fast Refresh "a second or two". Figma sends edits every 33 ms, Liveblocks batches every 100 ms, Google Docs measured 1 to 2 s with few users.

Unverified, because it needs a Cloudflare account: production CPU and memory, cold start of a 14 MB WASM Worker, R2 and D1 latency, Durable Object broadcast latency. No end-to-end edit-to-viewer time exists yet, since no live pipeline does. No multi-frame set on the canvas passes the readiness check today, so the test sets were built from real frames with `links` added.
