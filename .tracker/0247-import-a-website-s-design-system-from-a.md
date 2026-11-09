# #247 · Import a website's design system from a link

- State: open
- Labels: needs-triage
- Created: 2026-11-08T10:09:24.664Z
- Updated: 2026-11-08T10:09:24.664Z

Follows spool#242 (`.fig` drop on Home, merged in 96e95245). Each source gets an adapter in `src/daemon/import/` that writes the same `imports/<slug>/` output (README, outlines, images, icons), so `spool skill import` stays one format.

Take a site's colours, fonts and logo with the headless browser, as a design-system import rather than frames. Needs its own design round first. Order: 4 of 4.
