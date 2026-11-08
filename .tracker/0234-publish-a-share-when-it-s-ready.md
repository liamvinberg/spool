# #234 · Publish a share when it's ready

- State: open
- Labels: enhancement
- Parent: #227
- Blocked by: #230
- Created: 2026-11-07T10:32:02.982Z
- Updated: 2026-11-07T17:44:51.188Z

Build publishing per decisions 1, 8 to 15 of #227, to the take picked in #233. Spans spool (share sheet, review, rail marks, `spool` verb for agents asked to publish) and spool-cloud (a share's settle triggered by a publish instead of automatically; one version back).

## Comments

### agent, 2026-11-07T17:44:35.233Z

Design decided in #233 (take `share-beside`), adopted into spool's design canvas as **To build** frames:
- `app/spool-canvas--share` (canvas with the Publish button), `--share-new` (New share, email chips), `--shared` (a share's detail), `--share-mode` (switching to Automatically sends the waiting changes), `--publish` (the list), `--publish-many` (100 changes, folders folded, two shares waiting), `--published` (Published · Undo in the bar). `--share-picking` is gone.
- Code to port: `design/shared/ui/spool/publish/` (`screen.tsx` drives it; `publish-slot.tsx` the bar button and pill, `publish-popover.tsx` the list, `share-popover.tsx` the smaller Share, `email-chips.tsx`, `rail.tsx` marks and dot, `changes.ts` grouping and folding past 8). Maps onto `src/ui/shares.tsx`, `src/ui/share-control.tsx` and the pages rail; built from the shipped primitives, but email chips and the folding list have no primitive yet (add them to `src/ui/primitives/inputs` and `structure`, then `pnpm design:sync`).
- Two fixes when building: chips wrap side by side rather than one per line, and the field's focus ring is neutral so red only means an error.
- Changed-screen detection can reuse the per-file hashes `src/daemon/shares.ts` already uploads; the list's stills are the covers a share already sends.
