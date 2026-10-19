# #56 · Decide where the cloud compile runs

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #42
- Created: 2026-10-18T17:43:55.827Z
- Updated: 2026-10-18T17:43:58.529Z
- Closed: 2026-10-18T17:43:58.529Z

## Question

Where does Spool Cloud's compile-on-open run? Decide what the cloud builds and serves (#18) settled compiling on open with core's own code. Research: cloud compile on Cloudflare itself (#41) then found that a Worker gives the same bytes as native core. But Cloudflare bills 2 to 3 times the local CPU, isolates are usually cold, a compile holds up its isolate's other requests, a warm Durable Object doesn't reliably help, and a teammate watching live waits a median 1.3 to 1.8 s (p90 4.5 s) against the about-1 s flow target.

The options:

- **A Worker:** stateless, or a Durable Object per project.
- **A long-lived native compile service:** native esbuild and Oxide, core unchanged, warm contexts. It could run on the Coolify box (`coolify-main`, shared with other products) or on Cloudflare Containers, with Cloudflare still relaying, storing and serving.

Weigh latency, parity, what core has to factor out (§6 of `117-cloud-compile-recheck`), operations and failure modes, and cost from Research: what a team costs to run (#42).

*From Linear DEV-170.*

Related: #61, #62, #41, #18

Plane: SPOOL-56

## Comments

### agent, 2026-10-18T17:43:58.522Z

**Liam, 2026-10-05:** ## Resolution (grilling with Liam, 2026-10-04)

**The cloud compile runs on Cloudflare Workers, in one compile Durable Object per project. There's no native compile service in v1.**

- **A compile Durable Object per project, separate from the project's sync object.** In 155's replay it served a teammate watching live a median 1.29 s after the save, against 1.78 s for a stateless Worker. It used about 40% of the Worker's CPU (156), and saves waited 168 ms against 310 ms. One project's compiles never slow another project. It isn't the sync object, because a compile blocks its isolate and would stall saves and the relay.
- **Whose wait the ~1 s target covers.** Editors running Spool see a teammate's save through their own daemon's compile, about 0.15 to 0.3 s, so they already get it. The cloud compile only serves browsers. A viewer, or an editor away from their Mac, watching live accepts a median of about 1.3 s (p90 4.5 s) in v1. Outsiders get 0.15 s for a frame already compiled and 0.9 s for one that isn't.
- **Native compile is out:**
- `coolify-main`: a paid product's compile would share a failure domain with droneit, tretolv, vetna and the rest (load average near 6, disk 88% full).
- devobee: one machine on a home connection, exposed to the internet.
- A dedicated Hetzner EX44: $64.32 a month, breaking even at 49 heavy 8-editor teams.
- Cloudflare Containers: `basic` has 1/4 vCPU, which likely cancels native's speed edge (137 ms against 525 ms a frame). The smallest likely faster instance, `standard-2` at 1 vCPU, is about $41 a month always on. A sleeping one takes 1 to 3 s to start.
- Moving compile would only be for latency (156 §4). Revisit only if browser viewers find the wait a problem.
- **One class scanner everywhere.** Core replaces Oxide with the JS class scanner locally too, so the canvas and the cloud can't disagree, keeping #18's rule "if it plays on your canvas, it plays in the cloud" true by construction. The recheck's scanner missed nothing Oxide found across 2,383 files and added one harmless candidate. Spool then owns the scanner and checks it again whenever the pinned Tailwind version moves. Core also factors out recheck §6 items 1 to 7: injectable esbuild and stylesheet runner, nothing run at module load, a compile-only entry, file access and a pinned tsconfig. That way the Worker imports core's compile, not a copy.
- **Compiled output lives in the compile object's SQLite** (3 to 4 ms reads, 34 to 52 ms writes) and is served through the edge cache. It's named by a hash of its inputs, so it never changes. Nothing goes through R2 on the way to a viewer, which removes 250 to 300 ms of R2 writes and 131 to 152 ms per read from 155's measured round trip.
- **A compile that hits a Cloudflare limit** (30 s CPU, 128 MB) is a compile error as #18 defines it: members see the error, and outsiders get the last version that compiled. An alert fires on limit failures.

**Not checked; the spec must:**
\* how fast the JS scanner runs locally, and whether it holds on canvases other than Liam's
\* the canvas's frame-document compile (dev dialect) in a Worker; only the publication compile was run
\* JavaScript heap use against the 128 MB limit
\* how long compiled output is kept in the compile object, given an open tab must never lose its files

**Evidence.** `spool-cloud/research/`: `117-cloud-compile-recheck/` (§6, the extractor), `155-cloudflare-compile/` (§2, §4 to §6), `156-team-running-cost/` (§4, §5). Containers instance types and prices come from developers.cloudflare.com/containers, read 2026-10-04.
