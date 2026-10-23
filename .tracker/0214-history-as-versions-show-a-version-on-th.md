# #214 · History as versions: show a version on the canvas, restore what you see

- State: open
- Labels: ready-for-agent, enhancement
- Created: 2026-10-22T20:40:45.326Z
- Updated: 2026-10-22T20:40:45.326Z

## What to build

Rework the History pane on team projects from "actions on a stretch" to **versions**, as decided in task 225 and drawn in `app/spool-canvas--history`, `--history-deleted` and `--history-restore` (code: `design/shared/ui/spool/history-screen.tsx`). It replaces the open-a-stretch actions from #188 and #189: the fold-open file list with Restore on each line, the Restore… menu (frame / page / whole project), Put back, and Compare with now.

**Why:** a row was a change, but every button acted on the moment the change ended, which nothing on screen said. Restoring a file from the stretch that deleted it did nothing ("It already stands as it did then"), Compare with now showed little, and the Restore… menu was clipped by the fold's `overflow-hidden` so it couldn't be seen. Figma, Google Docs, Notion and Miro all do it as: pick a version, see it, restore exactly what you see.

### The pane
- **Current version** is the top row (`now`, hollow accent mark, "what everyone sees and edits"). It's selected while nothing else is.
- Every other row is a version, the end of a stretch, still paced as in #187. Its second line says what that version did, frame by frame: `cart changed · promo deleted`. A restore row keeps its ↺ and says `restored promo to 10:51 today`.
- Clicking a row shows that version. There is no fold-open detail. Clicking it again, or Current version, goes back to now.
- ↑ ↓ step through the versions while the pane or canvas has focus. Esc goes back to now.

### Showing a version on the canvas
- Every frame on the page is drawn as it stood at that version, read-only, through the existing compare route (`fetchCompare`, now for every frame on the page, not just the touched ones). The canvas edge gets a 2px inset accent.
- Frames that version changed carry a chip on their name row (`changed`, `added`; `deleted here` in danger) and a 2px accent ring. Unchanged frames step back to 55% opacity.
- A frame the version deleted stands where it was, as it was just before, dashed, at 45%, with **Bring back** (primary, sm) at its centre.
- A floating bar, top centre: the person's face, the moment (`10:51 today`), `after Ana's saves` (`after your saves` for the user), ↑ ↓ keys with `3 of 6`, **Back to now**, and **Restore this version…** (primary). When the version is the same as now, the button reads **Same as now** and is disabled.
- Hovering a row no longer outlines frames: showing a version replaces it.

### Restoring
- **Restore this version…** asks one question: title `Restore 10:51 today?`, body "Ticked frames go back to how they were then; unticked ones stay as they are. The team gets it as new saves, and Undo puts it back." Below it, one checkbox per frame that differs from now, all ticked, each saying `goes back to how it was`, `comes back` or `goes, it didn't exist then`. The button reads **Restore**, or **Restore 1 of 2** when some are unticked, and is disabled with none ticked. A frame's changed shared imports stay offered as #188 does it, off by default.
- **Bring back** asks `Bring back promo?`: "It comes back as it was at 10:51 today, just before it was deleted. Nothing else changes, and Undo puts it back." It restores that frame to the version before the one that deleted it.
- After a restore: back to now, each restored frame rings once, the restore row washes in at the top, and the toast offers Undo (⌘Z), as today.
- The daemon side mostly exists already: a ticked set is a restore of those frames' paths to the version (`RestoreAsk` with `paths`). One bundle per restore, so it is one row and one Undo.

### Removed
Compare with now and its canvas layer, the per-file Restore and Put back lines, the Restore… target menu, and the stretch fold's file list. A set-aside save keeps its notice, but it moves from the history detail to wherever #188's Put back is still needed (check with Liam if that's unclear).

## Acceptance criteria
- [ ] Picking a version draws every frame on the page as it stood then, read-only, with the chips and dimming above. Esc or Back to now restores the live canvas.
- [ ] ↑ ↓ step through versions. Current version is the top row.
- [ ] Restore this version… is disabled with "Same as now" when nothing differs. Otherwise its question lists exactly the frames that differ, ticked.
- [ ] Unticking restores only the ticked frames. The rest stay as they are on every editor's disk.
- [ ] Bring back on a ghost frame restores that frame alone to just before its deletion.
- [ ] Every restore is one row and one Undo (toast and ⌘Z), and Undo puts the paths back.
- [ ] Compare with now, the Restore… menu and per-file Restore are gone. No restore anywhere can do nothing.
- [ ] Viewers can still browse versions but get no Restore or Bring back.
- [ ] Browser test: pick a version, see the chips, restore one of two frames, undo. Unit tests cover the frame diff and the question's list.
- [ ] Changeset, since published behaviour changes.
