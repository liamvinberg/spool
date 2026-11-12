# #288 · New window: the window host and its slots

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #285, #287
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.646Z
- Updated: 2026-11-11T10:15:03.646Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

Extensions draw in the new window. The window gets its host and the window slots, and a frame part can talk to its window part.

Read the spec's "Life of an extension", "Slots in this spec" (Window) and "The new window". In short:

- **The window host**: official extensions' window parts are bundled as lazy chunks found from their manifests, activated with the same states and ownership as the other sides, each handed `spool/sdk/window`.
- **The frame around panes**: the rails, with open, close, width and order owned by core, and the head carrying each pane's icon. The **pane** slot fills it.
- **The toolbar** and the **tool** slot: a tool owns the pointer on the canvas while chosen (through the input function from the surface ticket) and hands back to Select.
- **Commands**: one registry behind keys, context menus (frame, canvas, page), the toolbar, a pane's menu and the key sheet. The **command** slot fills it; core's own actions are commands in the same registry.
- **layer** (canvas space and window space, under and over, taking the pointer only where it declares), **frame decoration** (label, edge, over), **notice** (one keyed line above the page), **setting**.
- **Slots an extension owns**: declared in its manifest with how many may fill them; filled by extensions that name the owner in `uses`; too many or an undeclared filler refused at load with a reason; the owner outlives what fills it.
- **The frame to window channel**: typed messages between a frame part and its own window part, checked for shape, for the sender owning its frame, and for size. The registry from a frame's document to its frame is core's, since frames are sandboxed and the message source is the only identity.
- **Order and authorship**, as Liam picked (`app/spool-canvas--extensions`, `--extensions-prototype`, `--extensions-loaded`): every piece carries its extension's id; in a side's head, the tools, menus and results, spool's own come first, then a thin divider, then others'; switching one on or off adds or removes it at the end and nothing else moves.
- **Containment**: every contributed render in an error boundary that draws nothing; every handler caught; an extension that keeps failing is stopped and shown as failed.
- The window side of the **test kit**, and the window entry of the SDK with the primitives, icons, theme roles and helpers behind explicit exports.

Prove each slot with a fixture extension that lives with the tests.

## Decided

- UI in a pane's head, a section, a menu, the toolbar is built from the SDK's primitives. Free drawing only in a pane's body, a layer and a decoration. The lint for colours and timings (`src/design-lint.ts`) covers `extensions/` too.
- React. No UI description language of our own.
- A layer never sees pointer events outside the regions it declares; that is how flow arrows and pins stay clickable without eating the canvas.

## Where to start

The spike's `core/window/` and `sdk/window.ts`. Today's code, to be checked: `src/ui/canvas/pane-window.tsx` and `PaneDef`, the toolbar and tools in `canvas.tsx`, `context-menu.tsx`, `src/ui/hotkeys.ts`, `hotkey-sheet.tsx`, `src/ui/primitives/`, how a frame's messages are identified today (`src/runtime/frame-shim/`, `frame-shell.tsx`).

## Leave alone

Today's window. Moving any real feature (later tickets).

## Done when

- A fixture extension per slot is proven through the test kit, and one walk in a browser shows a fixture pane, tool, layer, decoration, command (by key and by menu) and notice in the new window, then gone when the fixture is switched off, with nothing else having moved.
- A fixture that throws in render and in a handler leaves the canvas working and is shown as failed.
- A message of the wrong shape, from another frame, or too large never reaches a window part.
- The captured-frame test from the surface ticket still passes with the fixtures on.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.
