# #5 · Research: keeping one folder in sync across machines and the cloud

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.347Z
- Updated: 2026-10-18T17:43:57.202Z
- Closed: 2026-10-18T17:43:57.202Z

## Question

What exists for keeping one folder of small text files in live two-way sync across several people's machines and a cloud copy, where agents and people write files directly on disk? For each option (Syncthing-style file sync, Dropbox and Google Drive behaviour, Yjs, Automerge, Loro and other text sync libraries, Liveblocks, Durable Objects, Electric, Zero, Jazz and other sync backends, git-based live sync, Zed and Live Share style code collaboration): what happens when two writers change the same file, offline work, renames and deletes, images and fonts, whether it runs on Cloudflare, licence, maturity and cost.

Report: `spool-cloud/research/104-folder-sync/`.

*From Linear DEV-104.*

Related: #65

Plane: SPOOL-5

## Comments

### agent, 2026-10-18T17:43:57.197Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/104-folder-sync/` (commit `e1602b1`), with a 36-row comparison table and the probe code. Merge results and sizes are exact; timings were taken on a heavily loaded machine and are indicative only. All probes ran in Node, none inside Workers.

- There are three kinds of tool, with three conflict behaviours. File-level sync (Syncthing, Dropbox, Drive, iCloud, Mutagen, Unison, rclone) keeps a conflict copy or stops; it never merges. CRDT libraries merge by character, but something must first turn a whole-file overwrite into edits. Database sync engines (Electric, Zero, Convex, Instant, PowerSync) sync rows, not files.
- Only Automerge, Loro and json-joy take a whole new file version natively; Yjs and Diamond Types need a text diff first. The only filesystem-level CRDT tools found are Ink & Switch's `pushwork` and `darn` (archived). Zed and `pushwork` diff disk changes into the shared document; Replit's daemon turns disk changes into live edits.
- Two agents rewriting the same real frame at once: edits to different parts merge cleanly. Two edits to the same value give a third value that still compiles (`gap-3.5` and `gap-4.5` became `gap-34.5`). Delete against edit leaves stray text that compiles. One agent regenerating the file while another edits it broke compilation in 6 of 7 variants.
- Two machines importing the same file independently is dangerous: Yjs, Loro and Diamond Types doubled the content, and Automerge silently dropped one machine's edit. Importing with a fixed identity avoids that, but then either diverges silently or throws if the two files differ.
- History stays small for this kind of data: 1,000 rewrites of a 7 KB file cost 2.2x to 10.8x the file. Each live document costs 14 to 56 KB of memory; scaled to Spool's 1,983 files that is roughly 75 to 112 MB, against Cloudflare's 128 MB Durable Object limit (extrapolated, not measured).
- Images and fonts: only file-level tools sync them by difference; every CRDT tool treats them as whole files where the last write wins.
- Changes in the last year: Instant's cloud shuts down 2027-08-31, Code With Me ends in Q1 2027, Live Share and Replicache are in maintenance mode, Triplit and Y-Sweet have gone quiet after acquisitions.

Unverified: several prices, rename handling in Mutagen and Unison, whether Zed's collaboration server can be self-hosted, any Loro, Diamond Types or json-joy deployment inside Workers.
