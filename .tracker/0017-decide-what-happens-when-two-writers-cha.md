# #17 · Decide what happens when two writers change the same file

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #10, #13
- Created: 2026-10-18T17:43:55.451Z
- Updated: 2026-10-18T17:43:57.529Z
- Closed: 2026-10-18T17:43:57.529Z

## Question

Two members' agents, or an agent and a hand, change the same frame, shared component or tokens file at the same time. What happens? Options include: the last write wins, the edits merge, a lock or claim that everyone sees, or the file being split so it rarely collides. Also: how does an agent learn that a file is taken, and how does a person see it? Core's standing rule is "no locks by construction"; a shared canvas may overturn it. Liam doesn't expect much trouble here but wants it thought through.

*From Linear DEV-116.*

Related: #57, #60, #63, #65

Plane: SPOOL-17

## Comments

### agent, 2026-10-18T17:43:57.524Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**No locks. When two saves collide, the first to reach Spool Cloud stands, and the later one is set aside: kept in history, never applied, and its writer is told.**

Most overlaps are caught before the cloud sees them. Teammates' changes land as real files in about 1 s, so an agent's own read-before-write check notices them (Claude Code's Edit returns "modified since read", and a Codex patch fails when its context no longer matches), and the canvas hand edit already refuses with `stale-file`. What's left is the in-flight race and offline work.

- **No locks, no claims.** Core's "no locks by construction" stands (ADR 0005). The social signal is the name pill that docks on a frame's title while someone is inside it (Prototype live cursors and who's looking).
- **Collision rule.** A save built on a version its machine hadn't seen yet is a **collision**. The save that reached the cloud first stands, and the later one is **set aside**: kept in the team's history and not applied, and the writer's own disk takes the team's version, so there's still one canvas. This is the same rule as the hand edit's `stale-file`. Offline, it means a member coming back can never roll the team's canvas back. Nothing is merged, by character or by line.
- **Edit beats delete.** This is the one exception to first-wins, as in Syncthing and Dropbox. A deleted file that a teammate was still editing comes back for everyone, and the person who deleted it is told. A rename that loses this way leaves the old path back next to the new one.
- **`canvas.json` merges key by key.** Each page's place and the canvas-wide order are taken one key at a time, and the last write to a key wins, with no notice. `frame.json`, source, shared components, tokens and binary assets all travel whole under the collision rule.
- **Who is told.** Only the machine whose save was set aside. Each frame that renders the file gets a mark ("your change was set aside, Ben's arrived first") with three actions: **Compare**, **Put mine back** (an ordinary new save on top), and **Hand to agent** (one press to redo the change on top of the winner). Nothing is sent to an agent on its own, which matches ADR 0009. Coming back from offline with many set-aside files shows one summary instead of a mark on every frame. The member whose save won is not told.
- **Agents get no new signal.** They rely on their own tool's stale check. Agent-facing awareness of teammates belongs to Idea: how people's agents show up on a team canvas.
- **Files aren't restructured** to avoid collisions. Spool doesn't dictate structure.

Vocabulary: **Collision** and **Set aside** are defined in `spool-cloud/CONTEXT.md` (commit `24836c4`).

Handed on: how long set-aside versions are kept goes to the map's "History and restore in the cloud" item in Not yet specified.
