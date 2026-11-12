# #290 · Pages and Properties as extensions, and the Extensions page

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #288, #289
- Created: 2026-11-11T10:15:03.963Z
- Updated: 2026-11-11T10:15:03.963Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The first two things a person can switch: **Pages** and **Properties** as official extensions in the new window, and the **Extensions page** in Settings.

- **`extensions/pages/`**: the Pages pane (the tree, going to a page, the page's menu: new, rename, move, trash, restore, and the rest of what today's has), its commands, and the slot it owns, `spool.pages:rows`, one filler per page kind, which gives a kind its own rows in the tree (the deck fills it later).
- **`extensions/properties/`**: the Properties pane with its geometry section and whatever today's shows for a frame, a selection of many and a picked element, and the slot it owns, `spool.properties:section` (knobs and the deck fill it later).
- Both are window-only, written for the new window from the SDK alone, and look like today's (`app/spool-canvas` on the team canvas).
- **The Extensions page**, as designed in `app/spool-settings--extensions`: one list grouped by what you make; per row an icon, name, one line and a switch; the basics folded into "On for everyone"; the manifest's on or off sentence shown on a flip; the state when an extension is waiting or failed, with its reason. Official extensions only. Reached from the cog, the command palette and the app menu, as the design shows.
- **On and off**: per machine, through the settings registry. `spool extensions on|off <id>`. Switching takes effect without a restart: off disposes everything the extension drew, in every open project.
- **Baseline**: Pages and Properties on from the start. Someone who already uses spool has every official extension on.

Whatever the SDK lacks is added for everyone and listed in the handoff.

## Decided

- Not in this ticket: Add extension, Remove, Export, Show folder, linking, the confirm for an extension that is not official, the notice for a project that uses one that is off, onboarding's tiles. Stage three. Leave those parts of the design out, not greyed out.
- Nothing is lost when an extension is off: its pane is gone and the files are untouched.
- Today's window is not affected by the switches. Say so on the page while the new window is an experiment: one quiet line, since a person with the experiment off would flip a switch and see nothing.

## Where to start

Today's code, to be checked: `src/ui/canvas/sidebar.tsx` (the Pages tree), `properties-rail.tsx`, `rail-fields.tsx`, `rail-rows.ts`, `rail-move.tsx`, `rail-elements.tsx`; `src/ui/settings-page/` (`page.tsx`, `parts.tsx`, `experimental.tsx` for a section drawn from a declared list), `src/settings/registry.ts`. The design frames are on the team canvas (`pnpm -s dev open .` fetches `design/`; read `design/AGENTS.md` first).

## Leave alone

Today's window. The Extensions page's stage-three parts.

## Done when

- The Pages and Properties suites of today's window pass against the new window, unchanged; added to the parity list.
- Switching each off in Settings and by the CLI removes its pane at once and nothing else moves; on brings it back in its place; the project's files are byte for byte the same.
- A fixture extension that needs a missing service shows as waiting with its reason on the page, and a fixture that throws shows as failed.
- The page matches the design frame; put a screenshot beside the frame in the handoff.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`. A changeset (the Extensions page and `spool extensions` are reachable by anyone).
