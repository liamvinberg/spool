---
"spool.page": minor
---

The pages rail is a file explorer. A page is a folder and a frame is a folder with one entry file, so the rail can now do what a folder tree does.

Drag rows to arrange them, and drag a frame onto a page to move it there. Rename in place with Enter, F2, a double-click on a page name, or the menu. Duplicate with `⌘D` (`ctrl+D` elsewhere), copy and paste frames with `⌘C` and `⌘V`, and press `⌫` to move a frame or a whole page to the Trash, with the same undo toast the canvas has. Right-click any row for the verbs it has, and the `+` in the header makes a page that starts out being named. Arrow keys walk the rows and typing a name jumps to it.

The order you arrange rows in is saved in `design/canvas.json`, so it survives a reload and travels with the repo. It never moves anything on the canvas. Frames an agent writes while you are away land where they belong: a new variant appears under the frame it is a take on, and everything else at its alphabetical spot.

Renaming and moving are folder operations. Spool still never writes frame source, so a link that names a frame you renamed reads as missing until an agent fixes the name in the code.
