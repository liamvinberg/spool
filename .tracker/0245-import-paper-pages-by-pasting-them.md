# #245 · Import Paper pages by pasting them

- State: open
- Labels: needs-triage
- Created: 2026-11-08T10:09:24.656Z
- Updated: 2026-11-08T10:09:24.656Z

Follows spool#242 (`.fig` drop on Home, merged in 96e95245). Each source gets an adapter in `src/daemon/import/` that writes the same `imports/<slug>/` output (README, outlines, images, icons), so `spool skill import` stays one format.

Paper has no file export. Its ⌘C HTML holds a `paper-paste-start data-embed` JSON block. For a whole file, paste one ⌘A ⌘C per page into a single chip (`Paper · 3 pages`); the Paper MCP is a fallback for big files. Order: 2 of 4.
