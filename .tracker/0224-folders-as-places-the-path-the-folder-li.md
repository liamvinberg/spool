# #224 · Folders as places: the path, the folder list, Space peek and one drag rule in the Pages tree

- State: closed (shipped in 0.51.0)
- Labels: ready-for-agent
- Created: 2026-11-06T07:27:37.365Z
- Updated: 2026-11-06T11:31:17.122Z
- Closed: 2026-11-06T11:31:17.122Z

Replace page objects on the canvas with folders as places, per the decided take `explore/pages/pages-look` on spool's design canvas (task 421; sources beside it: `pages-keys`, `pages-trail`, `pages-peek`, `pages-groups`). Play the take before building: it is the spec for look and motion.

## Why
A folder today is two things at once: its own canvas, and a page object you drag around among frames on its parent's canvas, where the drag only writes a Place. People don't read that, and the drag means nothing. Files stay the truth: folders, pages and frames exactly as on disk.

## What ships
1. **No page objects.** A canvas draws only its page's own frames. Page objects, Bands, Place and the Shelf go (canvas, projection, `canvas.json` places, daemon placement for pages). A stored `places` key is ignored and left alone, never rewritten.
2. **A folder holding only folders draws as a list** (the root when it has no frames, `explore` in the fixture): centred rows, each its first frame's still, the name over a quiet `6 frames · tipping` line, a chevron. Arrows move the lit row, ⏎ / ⌘↓ / a click go in. Rows read the existing stills; nothing renders another page's frames live.
3. **The path**: the page's chain (`kaffe › explore › checkout`) in faint ink at the canvas's top left, waking as the pointer nears the top edge; each name goes up; after the current name a fainter ghost of where ⌘↓ goes (the first sub-folder). No chips, no always-on key hints: hints show only while ⌘ is held.
4. **Keys**: ⌘↑ up, landing with the folder you left picked (in the list or the tree), ⌘↓ into the picked or ghost sub-folder, ⌘[ / ⌘] back and forward through visited pages. They extend spool#142's ⏎ / Esc / ⌘↓ / ⌘↑ and stay in the one register (`src/ui/hotkeys.ts`) and on the ? sheet. Going in slides one way, up the other: transform and opacity only, motion tokens.
5. **Space peeks** a folder (Quick Look): over a tree row, a list row or a path name, Space opens that page's stills as one small flat map at their real geometry, anchored beside it; Space / Esc / moving away closes; ↑↓ walk to the next folder with the peek following. Peek is stills only. No long-hover peek.
6. **One drag rule in the Pages tree**: dragging a row shows one insertion line between rows (reorder, writes Order) or lights a folder row (nest, a move); a frame dragged from the canvas or the tree onto a folder row, list row or path name moves it; holding a dragged frame over a folder for a beat opens its peek so it lands at a spot there; Esc cancels mid-drag and everything springs back; every change gets an undo toast. Rows make room with a spring, transform only.
7. **Icons** stay as they are.

## Out of scope
The canvas field itself, frames' own geometry, the viewer's own rail beyond what the shared rail gives it.

## Done when
The take's flows work on a real project, the full suite passes, `design/frames/app/` is redrawn where the canvas and rail changed, and GLOSSARY.md drops Page object, Band, Place and Shelf and says what replaced them.

## Comments

### agent, 2026-11-06T11:31:17.122Z

Shipped in spool.page 0.51.0 (task 421). Adopted into design app/ as spool-canvas--pages and --peek; explore/pages deleted.
