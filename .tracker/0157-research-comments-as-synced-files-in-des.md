# #157 · Research: comments as synced files in design/ vs stored in Spool Cloud

- State: closed
- Labels: wayfinder:research
- Parent: #155
- Created: 2026-10-18T17:43:56.959Z
- Updated: 2026-10-18T17:44:02.274Z
- Closed: 2026-10-18T17:44:02.274Z

## Question

What would each way of storing comments take, in the spool and spool-cloud code as it stands? (a) Comments as files in a team project's `design/` (say `design/comments/`), synced like every other file, so every local copy holds them and an agent reads them with plain file reads. (b) Comments in Spool Cloud's own storage (D1 or the project's Durable Object), reached by the app, the browser canvas and agents through an API or a verb. For each: how a viewer or outsider in the browser, who isn't a writer on the sync today, would add one; how collisions, history (90 days), the save limits (bucket of 2,000 refilling at 120 a minute, 30,000 per editor per month) and the fingerprint repair would treat them; what a frame rename or delete would need; whether they leak to places they shouldn't (outsiders seeing comments on pages not shared with them); and how an agent on a member's Mac would read them. Cite files and lines.

Plane: SPOOL-157

## Comments

### agent, 2026-10-18T17:44:02.265Z

**Liam, 2026-10-17:** ## Resolution

Both options were read against the code. Nothing is decided here. Full write-up with file:line cites is in the README below.

- Team files and history live in the sync Durable Object's SQLite, not R2 and not D1. Nothing in the worker ever deletes a save or a blob, so history grows for good. The "90 days" is only a prototype and cost-research number.
- Only `travels()` paths sync: canvas.json, AGENTS.md, CLAUDE.md, and files under frames/ or shared/. A new design/comments/ folder needs a protocol change. A file inside a frame folder travels today.
- Only an editor's Mac can save. Viewers are refused, members' browsers only hold a presence-only socket, outsiders never connect. As files, viewers and outsiders would need a new write path.
- Every comment file would be an ordinary save: about 9 row writes, one token from the project's shared bucket (120 a minute), one count on the editor's 30,000 a month. A project move's saves are the one precedent for skipping those limits.
- A save under a frame folder marks that frame changed and restarts the 30-second wait before outsiders see a shared page. Comment files would need exemptions for that.
- A save needs an account (saves.account\_id is NOT NULL). Link-share visitors have none, so who they are in the history is open.
- In Cloud, the share check that runs on every outsider request, the purge loop and D1 cascades already fit. Costs: no offline writes, no free relay, agents need a read verb or prompt block. ADR 0005 allows a read verb. A verb that writes an answer would need the ADR amended.
- Third options: Cloud store mirrored to a non-travelling .spool/ folder for agents; a separate comments Durable Object per project; a comments path into the sync object exempt from the bucket.
- Unconfirmed: what "fingerprint repair" means (no feature of that name; three candidates are listed), whether 90-day retention is policy, how link-share commenters are attributed.

Context: branch 165-next-thing-i-think-is-really--wayfinder-165-research-165-comments-storage, research/spool-157-comments-storage/README.md (commit f37f445).
