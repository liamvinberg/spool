# #254 · Sync and compile: what a rebuild would gain

- State: closed
- Labels: wayfinder:research
- Parent: #251
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.215Z
- Updated: 2026-11-10T08:29:58.424Z
- Closed: 2026-11-10T08:29:58.424Z

## Question

Would rebuilding team sync and compile make spool cleaner, leaner or faster, and what must survive if we do?

Liam wants these looked at while the rest is rebuilt ("see if we can rebuild it more cleaner, leaner, more optimized"). Earlier advice was to leave them alone because their tests hold hard-won behaviour. Decide on evidence, without leaning to a rebuild for its own sake or to keeping out of caution.

For team sync (`src/daemon/team-*.ts`, `src/team-sync-protocol.ts`, and spool-cloud's side in `~/dev/projects/spool-cloud`, read only) and for compile (`compile*.ts`, `design-compile.ts`, `player-compile.ts`, hot modules, fast refresh, tailwind, vendor):

1. Size and what each part is responsible for.
2. Which complexity is essential (the rules in `GLOSSARY.md`: collision, set aside, drift, paused, gone local, stretch, restore) and which is accidental (duplication, dead paths, compat shims, workarounds).
3. Known bugs, TODOs and workaround comments.
4. Where time goes, with any numbers the code, tests or docs hold, and the clear wins.
5. What a rebuild must keep working: the wire protocol with spool.page, state on disk, live team projects and their 90 days of history.
6. A verdict per part: keep, rework inside, or rebuild, with what a rebuild gains and what it risks.

## Comments

### agent, 2026-11-10T08:29:58.424Z

## Resolution (research, task 557 scout, 2026-11-10; no tests or benchmarks were run)

# Team sync and compile: rebuild audit

## Decision and scope

**Rework both inside, not their underlying models.** Whole-file saves, per-file optimistic versions and one Cloud ordering authority suit agents editing real files. The compiler already has the right portability seam: injected files/esbuild/stylesheets, shared locally and in Cloud. Replace tangled coordination and redundant analysis, not these models. [D:team-sync.ts:78-93; Y:object.ts:344-352; D:design-compile.ts:46-68]

Read-only source audit: spool `3ff51cb5`, spool-cloud `4a9a433`. Sources: `S:` spool root; `C:` `/home/liam/dev/projects/spool-cloud`; `D:` spool `src/daemon/`; `Y:` Cloud `src/worker/sync/`; `F:` Cloud `src/worker/frames/`. Line counts include comments. No tests/benchmarks run or deployment inspected; numbers are source observations/constants. [S:AGENTS.md:5-13; S:GLOSSARY.md:17-40]

## Size and responsibility

**Sync:** `src/daemon/team-*.ts` has **5,316 production lines, 6,858 tests/helpers** (`team-sync-editors.ts` is a 119-line test helper). `team-sync.ts` is **2,982**: `localCopy` (509–1903) mixes connection lifecycle, watching, batching/pacing, writes, collisions, drift, backup recovery and restore sending; presence, project/account management and disk/socket helpers follow. Other modules handle Get it/moves, exports, comparison, restore, comments, covers, history, seen and merging. [D:team-sync.ts:509,1928,2055,2778; D:team-projects.ts:81; D:team-sync-editors.ts:9]

The **1,800-line protocol** includes file sync (1–630), presence (639–882), comments (895–1599), movement/source identity (1610+). Cloud sync: **8,377 production / 9,334 test lines**. Object 2,886 includes comments service (1140–1900); app 733, history 406, catch-up 156, backup 619, comments 921, crowd 406, presence 407, moves 273, daily pass 143. [S:src/team-sync-protocol.ts:14,639,895,1610; Y:object.ts:344,1140,1896; Y:history.ts:3; Y:backup.ts:1]

**Compile: 2,923 lines** in requested files: cache/session adapter `compile.ts` 214; host 14; portable compiler 869; player composition/styles 644; hot modules 354; refresh 447; Tailwind 197 + worker 26; vendor 158. Additional modules: play, stylesheet pool (210), resolver/reads/boundary, themes/fonts/frame styles/document. Flow: confined reads/build → Tailwind from same bytes → fonts/import map → document/hash → revalidation. Player adds split composition/per-frame style closures. Cloud imports this compiler, replacing native/disk/workers with wasm/memory/in-process styles. [D:compile.ts:48; D:compile-host.ts:6; D:design-compile.ts:178,340; D:player-compile.ts:188,477; D:hot-modules.ts:108; D:fast-refresh.ts:3; D:tailwind.ts:156; D:vendor.ts:10; F:compile.ts:1-40]

## Sync: essential complexity

- **Collision/set aside:** first arrival stands; edit beats delete; losing bytes/history/attribution survive. Losing machine takes team bytes, then three-way merges disjoint line edits and resends; otherwise local marks remain. Bases hold text ≤512 KB; binary, invalid UTF-8 or overlapping edits do not merge. `canvas.json` key-merges, including per-entry `places`. [S:GLOSSARY.md:27,35; Y:object.ts:926-1008; D:team-sync.ts:1209-1367; D:team-merge.ts:8-17,86-94; S:src/team-sync-protocol.ts:571-623]
- **Drift:** reconnect fingerprint/list/resend repairs unexplained divergence without overwriting unsent edits. Lost-record copies known to this machine preserve differences as marks; genuinely new copies may upload their own work. Backup recovery is distinct: epoch/restored head identify newer local work to send back versus obsolete files to replace.  [S:GLOSSARY.md:37; D:team-sync.ts:520-539,1374-1516; D:team-sync-connection.test.ts:594,633,684,723,769,813]
- **Paused/gone local/ended/offline:** limits or old protocol/format retain editable unsent work; billing lapse keeps link/git untouched and automatically resumes; membership/project removal ends a copy, while another account signing in must not. Offline is a connectivity signal. [S:GLOSSARY.md:19,23,40; D:team-sync-connection.test.ts:27,69,189,202,289,937,993]
- **Stretch/restore:** person+machine, 10-minute gap, restores separate. Restore adds ordinary versioned saves for file/frame/page/project, deleted files included, with optional shared dependencies and undo. It neither rewrites history nor promises atomic whole-project rollback; it remains subject to collisions and is exempt from fair-use accounting. [S:GLOSSARY.md:29-33; Y:history.ts:266-302; Y:object.ts:814-912; D:team-restore.ts:10-15,48-101; D:team-restore.test.ts:183,221,267]
- **Disk/git correctness:** atomic incoming writes cannot echo; catch-up cannot replace unsent edits; git checkout/reset/merge cannot become team saves; erased worktrees cannot mass-delete; outside-layout and symlink paths cannot travel.  [S:GLOSSARY.md:19; D:team-sync.ts:1130-1262; D:team-sync.test.ts:240,286,502,515,710; D:team-sync-connection.test.ts:447,633]

## Sync: accidental complexity, workarounds and time

**Rework inside:** explicit lifecycle/reconciliation states; pure decisions separated from socket/disk effects; one sender/acknowledgement mechanism for normal and restore saves. Currently those paths separately construct chunks/refs/inflight records/binary messages. Extract presence/comments from file engine and Cloud ordering class without changing object identity/ordering. Split protocol exports by subject, preserving facade. [D:team-sync.ts:540-636,873-1024; S:src/team-sync-protocol.ts:639,895; Y:object.ts:761-1008,1140-1900]

**Concrete compatibility duplication:** Cloud mirrors accepted protocols/format parsing, drift fingerprint/types, bundles and unpaid close code pending a core pin update (`spool.page` currently 0.48.0). Import published exports after advancing the pin. Negotiated old-object branches for batching/checks are rolling-upgrade behavior, not proven dead paths. No TODO/FIXME/HACK markers found in primary files; not proof of no open bugs. [C:package.json:49; Y:protocols.ts:4-8; Y:checks.ts:3-7; Y:bundles.ts:3; Y:object.ts:203; D:team-sync.ts:567-575,607-609]

**Existing optimizations to retain:** 50 ms write settling, 500 ms above 1 MB; 250 ms state-write coalescing; ≤1,000 saves / 16 MB bundles; server-advertised pacing avoids uploading refusals. Defaults are 120 sends/minute and 30,000/month: large cleanups can be policy-bound, not CPU-bound. Pings every 15 s plus 10 s deadline detect silent failures in ~25 s.  [D:team-sync.ts:392-426,645-648,695-709,873-950,2763-2771; S:src/team-sync-protocol.ts:154-156,497-505]

Cloud accounting uses maintained tallies rather than recounting each save; catch-up reads **2 MiB/turn**, yields among saves/joiners, and throttles aggregate catch-up at **50,000 bytes/ms**. Hibernatable sockets/automatic pong avoid idle-object wakeups. Local reconnect still scans files/records; fingerprints sort/hash live paths; folder events enumerate known paths. Measure and chunk/index these scans; no sync latency benchmark here establishes a rebuild speed win. [Y:object.ts:344-385,413-426; Y:catch-up.ts:5-12,73-88; D:team-sync.ts:1139-1181; S:src/team-sync-protocol.ts:366-375]

## Compile: guarantees and optimization targets

**Keep:** design/symlink confinement; host-independent resolution; `shared/ui` cannot import authored `spool`; React/Tailwind/import-map pins; standalone/player/Cloud parity; stamping/diagnostics/maps; asset/font/theme identity/cascade; failure/torn-read/font-revision cache correctness; one React instance/realm; same-document player/shared-module identity. [D:design-resolve.ts:36-64; D:design-compile.ts:178-208,664-740; D:design-reads.ts:32-54; D:compile.ts:106-140; D:vendor.ts:10-17; D:vendor-pins.ts:21-30; D:play.ts:27-33,94-109; D:tailwind.ts:36-54]

**Recorded costs:** Tailwind previously blocked daemon loop **~10 ms/frame**, **5 ms in build()**, stacking tens-of-ms stalls. Two stylesheet workers improved own-canvas full player composition from **17–20 s to ~15 s** versus one; esbuild was slower with three frame compiles in flight. Pool starts lazily; 30 s deadlines terminate stuck workers and redistribute other jobs. Cache-hit hashing still reads/hashes every input (often 100+) and yields every **2 ms**. Cloud lazily loads **14 MB wasm**, once/isolate. [D:stylesheet-workers.ts:49-80,119-194; D:compile.ts:175-214; F:compile.ts:17-36]

**Clear rework targets:**

1. **One reusable dependency/read graph.** Cold player builds split composition, then another esbuild closure per frame for CSS. Hot boot builds full frame for closure/CSS, then modules; every update plan rebuilds closure/Tailwind. Share analysis/snapshots, retaining standalone tree-shaking/CSS semantics.  [D:player-compile.ts:188-205,234-246,303-308; D:frame-styles.ts:24-43; D:design-compile.ts:345-354,434-464; D:hot-modules.ts:142-148,302-310]
2. **One cache-validity witness; coalesce misses.** Coalesce frame misses as player already does. Full frame/player hits hash old file inputs only; hot modules also validate resolution probes, player *style* keys include folder listings. **Suspected defect, not reproduced:** adding higher-priority `card.tsx` beside resolved `card.ts` leaves previous input bytes unchanged; a full-document/bundle hit bypasses resolver and stronger style check. Cloud cached documents likewise validate recorded source hashes only. Witness resolution/absence and content; watchers cannot be truth. [D:compile.ts:59,106-140,196-214; D:play.ts:120-140,182-200; D:player-compile.ts:118-141; D:hot-modules.ts:111-125; D:design-resolve.ts:10,126-145; F:object.ts:433-447]
3. **Bound ownership/memory.** Hot sessions evict at 256; browser reloads after 50 updates. Server `compiled` map has no eviction/removal API; frame cache retains roots/stamps indefinitely. Add disposal/byte budgets while retaining modules already-served documents need (player keeps current+3 retired bundles). Not a measured leak. [D:hot-modules.ts:105-149,176-185,283-286; D:fast-refresh.ts:29-30; D:compile.ts:59,150-155; D:play.ts:79-85,241-268]

**Rebuild Fast Refresh instrumentation only if promoted:** it scans column-zero declarations/hook-call lines, not parsed TSX; misses remount components, imported custom hooks force remount, formatting affects signatures. A syntax-aware transform is cleaner. Preserve opt-in, reload fallback, font/head checks, session URLs and update ceiling; do not make this experimental path mandatory for ordinary frames. [D:fast-refresh.ts:3-30,166-297,317-348; D:fast-refresh.test.ts:28,43,67,118,194,206]

**Keep Tailwind workers/vendor.** Sharing a mutable project-wide Tailwind compiler contaminates utilities/theme-variable output because build() accumulates; reuse finished pure results instead. Vendor's React export facade addresses documented CJS/esbuild behavior; memoized builds already share attempts and evict failures.  [D:tailwind.ts:143-154; D:vendor.ts:10-17,30-46,78-109]

**Contract mismatch:** Asset glossary says inline/no URLs; implementation emits content-addressed image URLs. Preserve implementation or explicitly change this. [S:GLOSSARY.md:65; D:design-compile.ts:742-793; F:object.ts:320-354,474-481]

## What must survive migration

- **Wire:** JSON controls + binary 4-byte big-endian header length/JSON/raw bytes; handshake/catch-up ordering; versions/bases, bundle outcomes, collisions, canvas merge, moves, pacing, presence/comments, drift/epochs. Protocol **2** accepts current+previous; old-format clients pause. Deploy support in Cloud before releasing new clients; retain `/sync/protocols` release gate. [S:src/team-sync-protocol.ts:1-44,73-120,439-470; Y:protocols.ts:10-44]
- **Disk:** preserve/migrate `spool.json`, ignored real design files, `.spool/sync.json` (head, per-file version/hash, account, ended/goneLocal/moved/forwarded/unmatched/epoch), merge bases, set-aside bytes/batches, machine comments cache and `synced-copies.json`. Record deletion changes reconciliation, not just performance; never reseed a known copy as first-time work. [D:team-sync.ts:95-122,516-539; D:team-merge.ts:8-14; D:set-aside.ts:8-18,41-53; D:synced-copies.ts:5-9,21; D:team-comments.ts:19-32]
- **Cloud/live projects:** stable project/object identity; current files/tombstones; retained applied/set-aside rows with version/base/hash/account/session/device/time/bundle/restore; blobs, delete notices, format/epoch/meta, tallies/limits, durable compile-notification outbox; distinct comments/share state. Import tree AND history, not just current files. [Y:object.ts:344-426,926-1008]
- **90 days history ≠ current-file TTL.** Purge exempts current-file saves and referenced blobs, preserves moved-in provenance, leaves comment stills alone. R2 backups retain **30 days**, separately. Backup restore preserves version high-water marks, creates new epoch, permits recovery of newer work from local copies; versions cannot be recycled. It is not editor Restore. [Y:purge.ts:1-43; Y:backup.ts:21,525-580; Y:object.ts:2064-2099]
- **Compile/security:** retain `spool.page/compile`, vendors/import maps, native/wasm version parity, Cloud parity, content identity and old served chunks. Extension contributions must not turn authored frames into trusted compiler/daemon code: confined reads and render-origin separation survive; Cloud explicitly uses a separate registrable frame domain. [C:CLAUDE.md:10-13; F:compile.ts:17-40; D:design-compile.ts:63-73,664-740; D:document.ts:175-204; D:play.ts:241-258]

## Verdict by part

Local sync: **rework inside**. Cloud: **keep model, rework boundaries/mirrors**. Compiler/resolver: **keep**. Graph/cache: **rework inside**. Refresh instrumentation: **rebuild if promoted**. Tailwind/vendor: **keep**. Evidence/gains/risks above.

Acceptance: mixed versions, restart/lost-record/offline edits, backup epoch, history restore, native/wasm parity. Tests are contracts, not reasons to freeze code. Measure cold/warm frame/player, edit→paint, loop delay, catch-up fairness and memory before claiming speedups.
