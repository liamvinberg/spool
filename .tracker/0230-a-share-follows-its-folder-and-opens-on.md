# #230 · A share follows its folder, and opens on what it shares

- State: closed (done)
- Labels: enhancement, ready-for-agent
- Parent: #227
- Tasks: task 481 (Shares follow their folders)
- Created: 2026-11-07T10:32:02.920Z
- Updated: 2026-11-07T17:35:29.758Z
- Closed: 2026-11-07T17:35:29.758Z

Decisions 2, 3 and 7 of #227. Spans spool and spool-cloud.

- A folder share takes the pages added under it later, at their next settle (spool-cloud `src/worker/shares/model.ts` stores a fixed `pages` list; whole-project shares already resolve their pages as the project stands, `frames/settled.ts`). Existing shares keep working.
- The outsider's canvas is rooted at what was shared: one shared folder is the top; several sit side by side by their own names, a clash shows the parent's name in grey. No parent pages (today `sharedCanvas` includes them), no project name standing for the root, no full paths in the player bar.
- The page list from task 473 draws the client's top when it holds only folders.

## Comments

### agent, 2026-11-07T11:35:31.856Z

Built, ready to merge (waiting for "ship it", both repos together).

- spool branch `481-work-spool-230-claim-it-a-share`: share sheet sends `folders` for every row chosen whole; solo uploads take pages under followed folders; viewer roots an outsider at what was shared (`src/ui/viewer/shared-top.ts`), page list draws that top, player bar says page name / frame name. Changeset `share-follows-folder.md` (minor). Full suite, typecheck, check green.
- spool-cloud branch of the same name: `shares.folders` (migration 0043 rebuilds shares), folders resolved live like whole shares, `sharedCanvas` drops pages above the share, link host 404s the page above a share.
- Order: cloud must not deploy before it pins a spool.page release with the new viewer, or old viewers lose nested shared pages from the rail.

### agent, 2026-11-07T17:35:29.758Z

Merged into main in spool (441aede1) and spool-cloud (952e8b6). spool-cloud not deployed: apply migration 0043 and bump spool.page to the release carrying this viewer first.
