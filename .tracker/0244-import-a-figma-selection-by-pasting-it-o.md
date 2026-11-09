# #244 · Import a Figma selection by pasting it on the canvas

- State: open
- Labels: needs-triage
- Created: 2026-11-08T10:09:24.652Z
- Updated: 2026-11-08T10:09:24.652Z

Follows spool#242 (`.fig` drop on Home, merged in 96e95245). Each source gets an adapter in `src/daemon/import/` that writes the same `imports/<slug>/` output (README, outlines, images, icons), so `spool skill import` stays one format.

Figma ⌘C puts a `(figma)` fig-kiwi binary on the clipboard, which the same openfig-core decoder reads. Its images are signed S3 URLs that expire after about 8 days, so fetch them at paste time. Order: 1 of 4.
