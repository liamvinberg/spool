# #243 · Removing a worktree deletes the team's files: a folder going must never sync as deletes

- State: closed (fixed on main)
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-08T02:02:31.471Z
- Updated: 2026-11-10T19:41:12.761Z
- Closed: 2026-11-10T19:41:12.761Z

## What happens

Every file under `shared/ui/spool/` of the team project `spool.page/devosurf/spool` has been deleted for the whole team four times: 2026-11-08 at 01:10:23, 02:08:53 and 03:26:49, and 2026-11-10 at 16:38. Each time an agent restored about 140 files from the team's history, and every frame that imports them was broken in between. #249 reported the same nights and is closed into this ticket.

## The cause, proven on 2026-11-10

agent-hub's log, to the second of the last deletion:

```
Nov 10 16:38:37 agent-hub: cleaning up task 502's worktree failed
  Command failed: git worktree remove --force /home/liam/agent-hub/worktrees/spool/502-this-is-just-a-wild-take
  error: failed to delete '…/502-this-is-just-a-wild-take': Directory not empty
```

A task's worktree held a fetched `design/` that the shared daemon (state `~/.spool-dev`, port 7767) was following as a local copy of the team project. Removing the worktree deletes its files one directory at a time while the root still exists. The daemon saw the files under `design/` vanish, took that for a person deleting them, and sent the deletions to the team. It also wrote into the folder while it was being removed, which is why git stopped with "Directory not empty" and why only one folder goes each time.

The guard that exists does not cover this: `present()` in `src/daemon/team-sync.ts` (about line 635) stops a copy "whose folder went", but during a removal the folder has not gone yet.

A specimen is on disk: `/home/liam/agent-hub/worktrees/spool/502-this-is-just-a-wild-take` is the half-removed worktree, with no source left and a `design/` the daemon still follows. Do not delete it by hand before the fix is in: that would do it again. `~/.spool-dev/synced-copies.json` lists 61 copies, 41 of them in folders that no longer exist.

## What to build

A folder being removed must never become a delete on the team. However a copy's folder goes (`git worktree remove`, `rm -rf` of the root or of `design/`, a checkout of a branch, a removal that stops half way), the copy stops being followed, nothing it lost is sent as a delete, and nothing is written into it. A person or an agent deleting files inside a `design/` that is otherwise whole still syncs as today, including many at once.

How to tell the two apart is yours to design; reproduce it first (the diagnosing-bugs skill), with a real `git worktree remove --force` of a copy a daemon follows, against the test team server the sync suites use. Things known:

- A removal takes everything beside `design/` with it; an edit does not. A delete could be held until the burst is over and sent only if the copy is still whole (its root, what stood beside `design/` when the copy was first followed, `design/canvas.json`).
- A delete is cheap to hold for a moment; a wrong one costs the whole team its files.
- `spool remove <path>` forgets a registered project. Check whether a running daemon stops following the copy when it runs, and make it so: it is what a cleanup should be able to call first.
- Leave out, unless nothing else is safe: asking a person before a large deletion is sent. That is a product decision; bring it to task 557 if you need it.

Then, with the fix running on 7767: the dead entries in the copies list and the registry are cleared by the daemon itself, and the half-removed 502 worktree is detached and can be deleted without anything reaching the team. Prove that on a copy of the situation before touching the real one.

## Second review

This is sync, and a miss deletes a team's files. Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) checks that no path sends a delete for a file whose copy was being removed, that held deletes cannot be lost or sent twice, and that ordinary deletes, renames and moves by a hand or an agent still reach the team.

## Leave alone

The wire protocol and the cloud. What a delete by a hand does.

## Done when

- A test removes a followed copy with `git worktree remove --force`, with `rm -rf` of the root, and with `rm -rf design`, and stops one removal half way: the team loses no file in any of them, and the copy is no longer followed.
- A test deletes fifty files inside a whole copy: all fifty deletes reach the team.
- The sync suites pass untouched, then `pnpm test` in full, `pnpm typecheck`, `pnpm check`. A changeset is added.
- The 502 worktree is gone and `spool history shared/ui/spool/canvas-path.tsx` shows no new deletion.

Found by tasks 500, 507 and 572; cause traced in task 557. Tell task 557 when it is on main: spec #265's UI tickets wait for it.

## Comments

### agent, 2026-11-10T19:41:12.761Z

Fixed and merged to spool main (283bf00a).

- **Copies:** a copy holds anything that went from disk until nothing more has gone for 2 s. It sends the deletes only if the copy is still intact, meaning:
  - its root is still a project (.git or spool.json)
  - design/.gitignore and design/.spool are still there
  - everything that stood beside design/ is still there
  - canvas.json is gone only if git took it
  Otherwise the copy stops: it sends nothing and writes nothing into the folder, and it is forgotten once the folder is gone. While the folder may be going, the team's frames wait.
- **False alarms** (a file deleted beside design/) resume syncing once the folder is still for two looks.
- **rm -rf design/** now stops syncing instead of refilling.
- **spool remove** forgets the copy through a running daemon, and fails loudly when the daemon doesn't confirm.
- **Tests** cover git worktree remove --force, rm -rf of the root, rm -rf design/ (offline, stalled), a removal stopped half way, a Mac's order stalled, 50 deletes while the daemon writes, and the false alarm. The full suite, typecheck and check pass.
- **Reviews:** a standard review and an Opus (claude-opus-5-5:high) sync-safety review, three rounds; the last found no blocker.
- **Live proof:** first on a copy of 502 in a lane with the real account. Then 7767 was started on main: it detached 502 and 10 other half-removed worktree husks, and synced-copies went from 61 to 20 with no dead entries. 502 was deleted. `spool history shared/ui/spool/canvas-path.tsx` shows no new deletion.

**Residual risk, accepted:** on a disk that lists the team's files before design/.gitignore, design/.spool and the root's .git or spool.json, a removal that stalls 2 s or more inside them would still be judged whole. devobee's and the Mac's orders are safe. The cure for agent cleanups is to call `spool remove` before `git worktree remove`.
