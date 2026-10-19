# #18 · Decide what the cloud builds and serves

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #4, #7, #8, #13
- Created: 2026-10-18T17:43:55.459Z
- Updated: 2026-10-18T17:43:57.554Z
- Closed: 2026-10-18T17:43:57.554Z

## Question

Does each member's machine compile and upload finished files, as the beta does, or does the cloud compile from source? Which states get built and when: the live state, branches on push, branches lazily the first time someone opens them? And what must every frame satisfy so its cloud copy always works, given the causes found for frames that fail to share today (mostly the navigation check before export, see Research: why sharing fails on some frames (#4))? Liam's bar: sharing must always work, and the upload should be as light as possible.

*From Linear DEV-117.*

Related: #41, #42, #43, #56, #59, #61, #62

Plane: SPOOL-18

## Comments

### agent, 2026-10-18T17:43:57.549Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**Spool Cloud compiles from source with core's own code, when someone opens a frame. Nothing that plays on your canvas is refused.** Liam's rule: if it plays on your canvas, it plays in the cloud. Sharing has refused frames because the beta's exporter is a second pipeline with its own extra rules. Only one pipeline will exist.

- **The cloud compiles from the source it already holds.** It uses the compile and player runtime from the `spool.page` package at its latest release, not a copy in spool-cloud. Core breaks the `design/` contract only with `FORMAT_VERSION`, so the newest release plays older formats. Members' machines upload only source: for a team project that's just the sync, and for a solo share it's the files the cloud lacks. This ends liamvinberg/spool-cloud#161's compile-locally rule, after Decide where a team's design lives and how changes travel (#13) already ended keep-source-local. Frame code still never runs on `spool.page`, because compiling doesn't execute it.
- **A frame compiles when it's opened**, and the result is kept under a hash of its inputs. Versions still waiting to compile are merged into the newest one. While a player is open, the frames it links to compile in the background. Measured by replaying 15,459 real saves (1,142 turns, 27 canvases):
- A median turn makes 9 saves to 4 files, 13 s apart.
- Compiling on open needs 1 compile per median turn against 8 for compiling every save, 79% fewer over all turns.
- A teammate watching live waits 0.3–0.9 s after the relay (at most 2.2 s warm, 4.9 s cold).
- Rebuilding every importer of a `shared/` save falls 101–239 s behind, and 27 real saves would break the 30 s CPU limit per request.
- The busiest replay of the whole period is under a month of the Workers Paid plan's included CPU.
- **No branch builds.** A team project has one live state.
- **Sharing never refuses.** The navigation check, the beta's local exporter and the required `links` export all retire. `links` may stay as an optional hint for arrows. Access is checked when each frame is opened: an outsider gets the pages shared with them, and anything else shows "This screen isn't shared with you". The flow map may warn the person sharing about links that leave the shared pages, but never blocks. Solo shares work the same way.
- **Members see every save live. Outsiders see a page once it's settled**, meaning the agent's turn ended or about 30 s passed with no saves. On the read-only canvas, frames update in place. In the player, the next screen is the new version, and nobody is moved mid-flow.
- **A frame that doesn't compile:** members see the real error, with file and line. Outsiders get the last version that compiled, or "This screen isn't ready yet" if none ever did. A runtime error in the viewer's browser shows what the local player shows.
- **Covers come from members' daemons.** The photo booth's pictures are filed under content hash, so the first daemon to shoot a version uploads it and the rest skip. A solo share's covers travel with its source. The cloud never photographs frames.
- **Standards:**
- Pinned `importmap.json` libraries are fetched when compiling and served by the cloud, as the beta exporter does.
- Assets, fixtures and scenarios are served from source, and the mock layer runs in the player as it does locally.
- Compiled frames are served from `onspool.page`.
- Compiled output is kept under its content hash, so an open tab never loses the files it's using.

**Required of core.** Compile frames with core's own pinned TypeScript settings, never a `tsconfig.json` above `design/`. Today one changes the output of 18 of 863 frames, which a cloud holding only `design/` can't reproduce. Also factor the compile out so a Worker can import it: injectable esbuild, scanner and stylesheet runner; nothing run at module load; a compile-only entry; and file access (recheck §6). The JS class extractor needs a home in core with a parity test. The extractor in 107 was wrong on 5 of 6 sets because core scans stylesheets and JSON too. The recheck's version misses nothing across 2,383 files.

**Evidence.** All in `spool-cloud/research/`:
\* `117-agent-save-cadence/` (`30f4a60`): the save replay.
\* `117-cloud-compile-recheck/` (`e5abf78`): core's own publication compile in local workerd. Byte-identical on 7 sets and all 863 compiling frames. Warm 0.15–1.03 s per set, a new frame 60–590 ms, first use 2.6–4.5 s, 14.5 MB bundle.
\* `107-live-update-cost/`: the original spike.

**Unverified.** Production CPU, cold start and storage latency all go to Research: cloud compile on Cloudflare itself (#41). That includes whether Cloudflare counts esbuild's extra threads as CPU. Costs go to Research: what a team costs to run (#42).

**Vocabulary.** **Settled** is defined in `spool-cloud/GLOSSARY.md` (`603f99c`). **Publication version** ("one complete, fixed set") now describes only the beta. Whether it survives belongs to the beta-links item in Not yet specified.
