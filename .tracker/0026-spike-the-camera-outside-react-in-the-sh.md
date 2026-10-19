# #26 · Spike: the camera outside React in the shipped canvas

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Blocked by: #24
- Created: 2026-10-18T17:43:55.530Z
- Updated: 2026-10-18T17:43:57.784Z
- Closed: 2026-10-18T17:43:57.784Z

## Hypothesis

Moving the camera out of React state takes 3 to 7 ms of main thread off every wheel tick with no visible change.

## Why

`canvas.tsx` keeps the camera in `useState` and every wheel event calls `setCamera`, so the whole `Canvas` render runs per tick, plus `FrameLabel` (`width = frameWidth * k`, `scale(1/k)`), the `12 / k` corner radius, and every layer that takes `k` or the camera as props. Measured on n200: 4 ms per pan tick and 6 to 9 ms per zoom tick, of which React is 1.7 to 3.7 ms; the same motion written straight to `[data-canvas-camera]` costs 1.1 to 1.4 ms (research 113, section 2).

## The spike

- A camera store outside React, written once per rAF, with the transform applied to the DOM directly. React reads the camera when it comes to rest, for the lifecycle and anything that is decided at rest.
- Everything that takes `k` today: labels, radius, arrows, walk tags, page objects, selection overlay, hand layer, rails that follow a frame. For each, record whether it follows by CSS variable, by the overlay's own transform, or by a rest-time render, and what it looks like mid-gesture.
- Do not use `will-change: transform` on the camera layer: on this DOM shape it costs 3 to 7 ms of layerization per frame.

## Gate

`bench/canvas.ts` on n200 and on the 1000-frame page, interleaved against stock: main-thread ms per tick under 1.5 at every zoom, and the zoom row at 6x throttle no worse than pan's. Nothing visibly lags the camera in a screen recording of a zoom.

Blocked by the bench ticket.

*From Linear DEV-125.*

Plane: SPOOL-26

## Comments

### agent, 2026-10-18T17:43:57.777Z

**Liam, 2026-10-02:** Landed on `main` and pushed (`4a85edf7` through `b1274a9d`, 16 commits, patch changeset). **The gate was not met**, and that is the finding.

- Per wheel tick on n200, canvas main thread: pan 4.2 to 4.6 ms → 2.6 to 2.9; zoom 7.1 to 8.6 ms → 3.2 to 3.9. Script time 1.7 to 3.8 ms → 0.3 to 0.5. The remainder (~0.8 ms layerization, ~0.6 ms hit testing per synthetic wheel event, paint, commit) is paid identically by stock; only the GPU picture layer removes it.
- `bench/canvas.ts` n200: zoom p95 at 6x 34.7 → 17.9 ms, level with pan; at 4x 18.3 → 10.1.
- Lockstep proven with composited screenshots mid-pan and mid-zoom; a deliberately late control box shows the check catches lag.

Followers and how they move: frames and covers ride the field transform; field transform, labels, corners, page labels and rings, arrows, walk tags, selection furniture, agent hand, zoom readout and the share popover are store subscriptions writing styles in the same frame; lifecycle mounts and camera persistence are decided at rest (the store says when, `REST_MS` 100). Labels and corners beyond 25% of the viewport stay stale while moving and catch up at rest. No CSS variables, no `will-change`.

Review fixes before landing: first-frame label work, cross-page landing flight restored, share popover lag, entered-frame wheel zoom measures again, glossary clash with Place, shared helpers.
