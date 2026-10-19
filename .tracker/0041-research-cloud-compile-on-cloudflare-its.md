# #41 · Research: cloud compile on Cloudflare itself

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.679Z
- Updated: 2026-10-18T17:43:58.178Z
- Closed: 2026-10-18T17:43:58.178Z

## Question

How does Spool Cloud's compile behave on Cloudflare itself rather than in local workerd? Production CPU per compile (frame, shared component, tokens), cold start of the \~14 MB WASM Worker, R2/D1 or Durable Object read and write latency for source and compiled output, and the edit-to-viewer time end to end (save, relay, compile on open, served from `onspool.page`).

Decide what the cloud builds and serves (#18) chose cloud compile on demand from local evidence only: `spool-cloud/research/107-live-update-cost/`, `117-agent-save-cadence/`, `117-cloud-compile-recheck/`. Replay the 117 save timelines against the deployed Worker.

Needs a throwaway Worker deployed to Liam's Cloudflare account: ask Liam before deploying.

Added by the recheck (`117-cloud-compile-recheck/`): a fresh isolate's first compile spends 2.6–4.5 s of process CPU but only 0.35–1.3 s on the isolate's thread, so check what Cloudflare bills. esbuild's memory grows with each request an isolate serves (12–47 MB seen). Keeping an esbuild context warm across requests, for example in a Durable Object, is untried.

*From Linear DEV-155.*

Related: #56, #61, #62, #18

Plane: SPOOL-41

## Comments

### agent, 2026-10-18T17:43:58.171Z

**Liam, 2026-10-04:** ## Resolution

Measured on Cloudflare itself (account `d2b578c6…`, Workers Paid, colo ARN, 2026-10-04). The report is `spool-cloud/research/155-cloudflare-compile/README.md`, commits `3486951` and `2fa5979` on spool-cloud main.

- **Output:** on production, core's compile gives the same bytes as native core (72/72 sets in stateless isolates, 24/24 in a Durable Object, 28/29 single frames; the 29th is a known tsconfig-dependent frame).
- **Billed CPU is about 2 to 3 times local**, read from Cloudflare's own per-request `cpuTime`.
- A warm set of 1 to 18 frames costs 0.24 to 2.3 s.
- One canvas frame new to a warm isolate costs a median 0.53 s (p90 0.82 s, max 1.57 s).
- A fresh isolate's first compile is billed 0.5 s (one frame) to 4.6 s (12 frames). Cloudflare bills more than the isolate thread showed locally, but less than the whole process.
- **Startup:** the 14 MB Worker deploys and starts fine (`startup_time_ms` 11 to 27 against a 1 s limit). Script start isn't billed, but a viewer waits 180 to 260 ms longer.
- **Cold isolates are the normal case.** Only 4 of 14 idle-gap probes reached an isolate that had compiled before, even after 5 or 13 s gaps. In the replay, 23 of 59 compiles were an isolate's first. A compile also holds up other requests to its isolate (saves waited a median 310 ms).
- **Memory:** esbuild's memory levelled at 56 to 58 MB and peaked at 87.5 MB with no failures. JavaScript heap use can't be seen, so the margin to 128 MB is unconfirmed.
- **Storage, read and write, inside the Worker:**
- Durable Object SQLite: 3 to 4 ms and 34 to 52 ms.
- D1: 10 to 14 ms and 42 to 64 ms.
- R2: 131 to 152 ms and 255 to 297 ms; one object per file makes a closure read 0.3 to 0.9 s.
- **A warm esbuild context in a Durable Object didn't consistently cut CPU.** The object went to a new isolate after 120 s or more idle.
- **Edit to viewer:** a teammate watching live sees a save served after a median 1.3 to 1.8 s (p90 4.5 s), against 117's local 0.3 to 0.9 s and the about-1 s flow target from 107. An outsider waits 0.9 s for a frame not yet compiled and 0.15 to 0.2 s for one already compiled.
- **`node:fs`:** a read-only open of a missing path fails cleanly with ENOENT on production. A read with a null position still throws, so the bridge's position tracking is still needed.
- **Serving hop:** timed against the beta publications Worker, because production `onspool.page` hosts returned 522.

All `spool-compile-probe` resources are deleted (Worker, Durable Object class, R2 bucket, D1 database), and the Cloudflare API confirms none remain.
