# #226 · spool upgrade refuses a pnpm 11 global install

- State: closed (fixed)
- Labels: ready-for-agent, bug
- Created: 2026-11-06T17:06:13.157Z
- Updated: 2026-11-06T17:32:57.539Z
- Closed: 2026-11-06T17:32:57.539Z

On devobee, `spool upgrade --yes` on 0.49.0 said: `no supported package manager owns /home/liam/.../.local/share/pnpm/store/v11/links/@/spool.page/0.49.0/<hash>/node_modules/spool.page/dist/cli.js — upgrade it with the tool that installed it`.

It was installed with `pnpm add -g spool.page` on pnpm 11.9, whose global packages live in the store's `v11/links/` layout. The detection (`selfUpgradeable` / `runUpgrade`) only knows older pnpm paths. `pnpm add -g spool.page@0.51.1` worked by hand. Teach it pnpm 11's layout, with a test from that path.

## Comments

### agent, 2026-11-06T17:32:57.539Z

Fixed in 60843052 (merged to main). `planUpgrade` now recognises pnpm 11's `store/v11/links/` real path, finds the install group's hash symlink under `<home>/global/v11/` (stable across `pnpm add -g`) as the package dir, and looks for pnpm in `<home>/bin/` too. Test builds devobee's layout on disk; checked against devobee's real install. Patch changeset `upgrade-pnpm-11.md`.
