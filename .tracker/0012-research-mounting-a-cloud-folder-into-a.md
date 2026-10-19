# #12 · Research: mounting a cloud folder into a local project

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.406Z
- Updated: 2026-10-18T17:43:57.365Z
- Closed: 2026-10-18T17:43:57.365Z

## Question

Liam's idea (2026-10-01): the team's `design/` folder lives in Spool Cloud and is mounted into each member's project, so their local agents keep writing ordinary files and the person just sees the project in Spool. What are the ways to make a cloud-held folder appear as a normal local folder (macOS File Provider, FSKit, macFUSE, network drives, rclone mount and similar), and how does each behave for agents writing files, for Spool's file watcher seeing other machines' changes, for git, offline, and speed with many small files? And what does a teammate whose agent runs in the cloud and clones the repo see?

Report: `spool-cloud/research/112-mounted-folders/`.

*From Linear DEV-111.*

Related: #65

Plane: SPOOL-12

## Comments

### agent, 2026-10-18T17:43:57.360Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/112-mounted-folders/` (commit `c8bf8a4`). It is numbered 112 because 111 was already taken. Spool's own watcher was run against real NFS and WebDAV mounts (rclone, already installed). File Provider and FSKit were not run, because they need a signed app extension.

- No mount mechanism is invisible to the person. File Provider folders (the way Dropbox, Google Drive streaming and Box work today) must live under `~/Library/CloudStorage` and can't be placed at a project's `design/`. Network mounts, FSKit and FUSE-T can sit at `design/` itself, but they hide whatever git tracked there.
- A symlink doesn't get around it: Spool already refuses a `design/` symlink that points outside the project, and git can't stage through one (`pathspec ... is beyond a symbolic link`).
- The deciding fact for a shared canvas: on NFS and WebDAV mounts, writes made through the mount fire watcher events, but writes arriving from elsewhere (what another member looks like) fire nothing. They only appear when caches expire, anywhere from seconds to over six minutes.
- With no network latency added, a mount costs about 10x more per small write and 60x per read than local disk. `git add` of 300 files ran 2 to 6x slower; with `.git` on the mount too it took 22 and 78 s, against Spool's 15 s limit per git call. The machine was heavily loaded, so treat the speed numbers as indicative only.
- Two members writing one file: the store kept one version, and the other member's mount kept showing its own lost edit 12 minutes later, with no error.
- Claude Code and Codex both have open issues on exactly these paths: File Provider hangs and permission errors, FUSE and SSHFS write errors, and Codex's sandbox refusing symlinked writable folders.
- Cloud agents (Claude Code on the web, Codex cloud) only get the git clone. A setup script could fetch the files, but its result is cached for about 7 days (Claude) or 12 hours (Codex).

Unverified: whether another device's edit fires an event on a File Provider folder, macFUSE and FUSE-T themselves, SMB, Linux, Windows, and real cloud latency.
