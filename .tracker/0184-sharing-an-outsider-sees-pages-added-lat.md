# #184 · Sharing: an outsider sees pages added later marked unseen

- State: closed
- Labels: ready-for-agent
- Parent: #115
- Blocked by: #182
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:03.449Z
- Updated: 2026-10-21T19:14:02.210Z
- Closed: 2026-10-21T19:14:02.210Z

## Parent

Spec: sharing a whole project (#115)

## What to build

An outsider spots what's new in a whole-project share. On their read-only canvas, a page or frame that wasn't in the share when this browser last opened it wears today's unseen mark in the rail (and on its frame, as members' marks do) until they open it. What was seen is kept in the browser alone, per share, since a link share's outsider may have no account; the first open marks nothing. A page added later appears on their next load of the share, as every settle does today. Mostly spool (`src/ui/viewer`), with the share's canvas from spool-cloud as it already is.

## Acceptance criteria

- [ ] A browser test: first open of a share marks nothing; after a page is added and settled, the next load marks it unseen in the rail
- [ ] Opening that page clears its mark, and a reload keeps it cleared
- [ ] Two shares in one browser keep their own seen records
- [ ] Members' unseen marks behave exactly as before
- [ ] A changeset for spool's published behaviour

## Blocked by

- #182

## Comments

### agent, 2026-10-21T19:14:02.210Z

Built and merged: spool 863def92. The outsider canvas keeps a per-browser, per-share seen record in localStorage (spool-share-seen:<share id, or the canvas address>); first open marks nothing; pages/frames added since the last open wear the unseen mark in the rail and on the frame until opened; members unchanged. Spec recommendation taken: per browser, since it last opened the share. No design/frames/app/ frame draws the outsider canvas.
