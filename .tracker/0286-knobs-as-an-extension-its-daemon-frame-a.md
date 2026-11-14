# #286 · Knobs as an extension: its daemon, frame and compile parts

- State: closed (superseded by the ground-up rebuild, map #333)
- Parent: #284
- Blocked by: #285
- Created: 2026-11-11T10:15:03.357Z
- Updated: 2026-11-13T14:47:31.179Z
- Closed: 2026-11-13T14:47:31.179Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

Knobs becomes the first real extension, on the three sides that exist: `extensions/knobs/` with a daemon part, a frame part and a compile part, holding the one implementation. Nothing a person sees changes: today's window keeps its knobs section, repointed at the extension's routes.

- The daemon's knobs routes and the reading of `ui.knobs` literals from source move into the daemon part, under `/x/spool.knobs/`.
- `ui.knobs` moves into the frame part, with its declared fallback (a frame reads its declared values when nothing is driving it) and its types added by augmentation.
- The stamping of `ui.knobs` calls moves into the compile part, in the cache key, running in every compiler (the daemon's, the player's, the HTML export's, and the `./compile` export spool.page's worker uses).
- Today's window calls the new routes. Its knobs UI is not touched otherwise.
- Knobs' tests move with the code and pass against the extension.
- The experiment `knobs` (stage beta, so on by default) keeps deciding whether knobs exist, as today.

Whatever the skeleton lacks for this is added to the SDK for everyone, never reached around. Say in the handoff what was added.

## Why

A fixture proves the host; a real feature proves the API. The spike moved knobs once (#259) and found what it needs: a compile part, `writes.plan` (window side, later), boot data, the parser exported by the SDK with the loader as an argument. Moving the daemon, frame and compile parts for real, not copying them, keeps one implementation while two windows exist.

## Where to start

The spike's `spikes/extension-core/extensions/knobs/` on the local branch `567-wayfinder-map-251-ticket-259-a`. Today's code, to be checked: `src/daemon/knob-literals.ts` and the knobs write route, which is in `src/daemon/hand-routes.ts` (around line 293; `app.ts` only wires it), `ui.knobs` in `src/runtime/frame-runtime.ts` and `spool-public.ts`, the stamp in the compiler, `src/ui/canvas/knobs-section.tsx` and `src/ui/api.ts` for the calls to repoint.

## Leave alone

How knobs look and behave. The window's knobs section beyond its calls.

## Done when

- No knobs code is left in core: the lint from the skeleton holds, and core's tests pass with `extensions/knobs/` absent from the build (frames calling `ui.knobs` then get the fallback).
- Knobs' existing suites pass, in today's window and in play, in an HTML export, and through the `./compile` export.
- Changing the compile part's version changes the compile cache keys; building again with the same version changes none.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.

## Comments

### agent, 2026-11-13T14:47:31.179Z

Superseded on 2026-11-13: Liam decided to rebuild spool from the ground up in a new repo (task 634), so the new window is not built beside today's in this repo. The foundation is being decided on the map #333, and this page stays as evidence for its tickets (above all #350, the extension system on the new foundation). Nothing here was built.
