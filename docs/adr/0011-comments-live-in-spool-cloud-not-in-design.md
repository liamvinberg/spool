# Comments live in Spool Cloud, not in design/

Everything else in a team project is a file in `design/`, but comments are not. They are stored in Spool Cloud, in their own table in the project's sync Durable Object, outside the save path. A comment takes nothing from the project's save bucket or an editor's month, is not a save in the team's history, does not wake the compile object, and does not restart a shared page's wait before outsiders see a new version. Anything on a Mac's disk is at most a read-only copy of what Cloud holds.

**Why not files.** Viewers and outsiders on a share can comment, and only an editor's Mac can save to a team project. As files, every comment would also be an ordinary save: a token from the shared 120-a-minute bucket, a history row kept for good, a frame marked changed and reloaded on every Mac, and a fresh 30-second wait on the page it sits on. Outsiders would need comment files filtered per share and a way to write that is not a member's save. Figma keeps comments out of its document store for the same kind of reasons.

**Why the sync object and not a new one or D1.** The sync object already holds a socket from every Mac's local copy and from every member's browser looking at the canvas, so a new comment reaches them live with no new connection. It is cleared with the project by `forgetProject` and follows a move between teams, since the project id stays. A comments object of its own would split cleanly but need a second socket per browser or a relay through the sync object. D1 gives queries across projects and foreign-key clean-up, but it has no push and shares the database that holds sign-in. If notifications need to find comments across projects, a small D1 index can be added then.

**Accepted trades.** A Mac that is offline shows the last comments it saw and cannot post; there is no offline queue. Agents no longer get comments for free by reading `design/`: how they reach them (a read verb, a block in their prompt, or a read-only copy on disk) is decided with how agents act on comments. Comments have no history unless one is built for them.

Research: `spool-cloud` `research/spool-157-comments-storage/`.
