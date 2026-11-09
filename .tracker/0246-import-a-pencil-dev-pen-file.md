# #246 · Import a pencil.dev .pen file

- State: open
- Labels: needs-triage
- Created: 2026-11-08T10:09:24.660Z
- Updated: 2026-11-08T10:09:24.660Z

Follows spool#242 (`.fig` drop on Home, merged in 96e95245). Each source gets an adapter in `src/daemon/import/` that writes the same `imports/<slug>/` output (README, outlines, images, icons), so `spool skill import` stays one format.

A `.pen` file is documented JSON: https://docs.pencil.dev/for-developers/the-pen-format. Dropping one on Home should work like a `.fig`. Order: 3 of 4.
