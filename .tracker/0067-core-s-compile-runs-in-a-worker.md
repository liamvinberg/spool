# #67 · Core's compile runs in a Worker

- State: closed
- Labels: ready-for-agent
- Parent: #61
- Created: 2026-10-18T17:43:55.935Z
- Updated: 2026-10-18T17:43:58.984Z
- Closed: 2026-10-18T17:43:58.984Z

## Parent

#61

## What to build

Spool Cloud can import core's compile from the published `spool.page` package and get the same bytes the daemon gets. Prefactor first, each step green:

- Frames compile with core's own pinned TypeScript settings; a `tsconfig.json` above `design/` no longer changes output.
- A JS class scanner replaces Tailwind's Oxide in the daemon too, so the canvas and the cloud can't disagree. Port the scanner proven in `spool-cloud/research/117-cloud-compile-recheck/`.
- A compile-only entry takes injected esbuild, class scanner, stylesheet runner, file access and import-map library fetch, runs nothing at import, and covers both the publication compile and the canvas's frame-document compile. The daemon calls it with native esbuild and disk access.

## Acceptance criteria

- [X] A hostile `tsconfig.json` above `design/` leaves compile output unchanged
- [X] A parity test runs the JS scanner and Oxide over the repo's `design/` and fixtures: same candidates (allowing the documented extra) and the same stylesheet bytes
- [X] Local scanner timing measured on at least one canvas besides Liam's and noted on the ticket
- [X] Oxide is no longer a dependency
- [X] Importing the compile entry with in-memory files and esbuild-wasm compiles fixture frames byte-equal to the daemon, for both dialects
- [X] Nothing in the compile entry runs at module load
- [X] Changeset for the pinned tsconfig and scanner swap

## Blocked by

None (can start immediately)

*From Linear DEV-182.*

Related: #3

Plane: SPOOL-67

## Comments

### agent, 2026-10-18T17:43:58.977Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0 as spool.page/compile. The cloud compile imports it and gets the same bytes as the daemon (see #76).

Scanner timing, measured on Liam's M1 Pro on 2026-10-05. Every compiling frame of each canvas, median of 5 runs per frame.

| Canvas | Frames | JS scan p50 / p90 / max | Oxide p50 / p90 / max | Missed / extra | CSS differs |
| --- | --- | --- | --- | --- | --- |
| chamfer | 614 | 4.4 / 8.2 / 17 ms | 1.5 / 3.3 / 26 ms | 0 / 0 | 0 |
| lek | 243 | 8.1 / 16.6 / 29 ms | 2.3 / 4.2 / 9 ms | 0 / 0 | 0 |
| securesend | 158 | 1.3 / 3.7 / 6 ms | 0.6 / 1.0 / 2 ms | 0 / 0 | 0 |
| tuck | 69 | 0.8 / 1.6 / 7 ms | 0.3 / 0.6 / 1 ms | 0 / 0 | 0 |
| olmestudios | 38 | 0.4 / 8.5 / 9 ms | 0.3 / 2.1 / 2 ms | 0 / 0 | 0 |
| matmannen | 41 | 7.1 / 8.0 / 10 ms | 1.6 / 1.8 / 2 ms | 0 / 0 | 0 |
| spool (Liam's) | 910 | 12.6 / 27.2 / 51 ms | 2.2 / 5.1 / 29 ms | 0 / 0 | 0 |

- The JS scanner is 3 to 6 times slower than Oxide. It also hands Tailwind more words to check, so Tailwind's build slows too.
- A whole frame compile, p50 and p90, before and after: chamfer 15 → 16 ms and 17 → 19 ms; spool 16 → 17 ms and 29 → 42 ms; lek 21 → 37 ms and 30 → 58 ms.
- On all seven canvases both scanners find the same classes and give the same stylesheet bytes.

Decisions:
- No library fetch in the compile while nothing needs it. Members' and outsiders' frames load pinned https libraries straight from their CDN, under the frame policy. spool.page/compile gets a fetchLibrary dependency only when a ticket needs one.
- The scanner cost is accepted. It stays well inside "about the same time" for a save to reach the canvas. Filtering the words first would need its own parity proof.
- Core finds imports itself, so the compile works on files in memory. Imports need exact capitals, and a package.json no longer changes which file an import reaches.
- A test now fails when tailwindcss and @tailwindcss/oxide differ in version, so parity runs again whenever Tailwind moves.

Left: the exact-capitals and pinned TypeScript changes went out as patch, though each can stop a frame that compiled before. They should have been minor and said Breaking. Nothing to fix now; follow docs/releases.md next time.
