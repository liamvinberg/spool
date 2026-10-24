# #216 · Storage for images and other large assets

- State: open
- Labels: needs-triage
- Created: 2026-10-23T12:38:31.151Z
- Updated: 2026-10-23T12:38:31.151Z

## Why

Liam, 2026-10-22 (task 215): images take a lot of space, and decks and other creative work (#129) will bring many more of them: photos, renders, textures, video later. Spool may need a storage plan for them before presentations land.

## Where it stands today

- Images are plain files in `design/` (for example `shared/assets/`), and frames import them like any file.
- A team project syncs `design/` whole through spool.page. The limits are 25 MB a file and 1 GB a project (`FILE_LIMIT_BYTES` and `PROJECT_LIMIT_BYTES` in `src/team-sync-protocol.ts`). A file over the limit stays on the machine that wrote it, and teammates see it as missing.
- History keeps old versions, so every new version of a big image adds to what is stored.
- Spool doesn't shrink or convert images on the way in. Agent attachments only accept png, jpeg, gif and webp up to a size limit.

## Questions for later

- Do big files stay plain files in `design/`, or go to separate storage (R2, for example) with `design/` holding a small pointer, like Git LFS?
- Should spool shrink and convert images when they come in (to webp or avif, capped at the largest size a frame draws them)?
- How do history and backups treat big binary files: keep each one once and share it between versions, keep fewer old versions?
- Are the limits per team or per plan, and where do free and paid split?
- Video, once a film kind exists.

Related: #129
