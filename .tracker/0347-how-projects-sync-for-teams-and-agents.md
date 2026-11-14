# #347 · How projects sync for teams and agents

- State: open
- Labels: wayfinder:research
- Parent: #333
- Blocked by: #342
- Created: 2026-11-13T14:47:11.378Z
- Updated: 2026-11-13T14:47:11.638Z

## Question

How do tools keep a folder of files in step between people, agents and a server, and merge two edits to the same thing?

Primary sources: CRDTs and their libraries in production (Automerge, Yjs, Loro, Diamond Types), Figma's multiplayer, Linear's and Replicache's and Zero's sync, git-based ones, Jazz, Electric, LiveStore, and file-first tools where agents write to disk (what happens when an agent and a person change the same file). For each: what merges and what collides, what it costs in bytes and time, whether plain files on disk can stay the truth, how offline works. Read today's sync first (`src/daemon/team-sync.ts`, `src/team-sync-protocol.ts`, the audit on ticket #254, tickets #313 and #314).

Notes to `~/.brain-archive/spool-foundation/research/sync.md`.
