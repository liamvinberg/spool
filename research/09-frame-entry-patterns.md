> Research asset from the frame-entry exploration, 2026-07-23. Primary sources only. Product behavior is current as documented or, for Excalidraw, pinned to the cited source commit.

# Entering Live Frames on Spatial Canvases

## Spool today

Spool has two separate state changes:

1. The global `Live` mode lets visible frames run.
2. Entering one frame gives its iframe pointer and keyboard ownership.

On the canvas, a click selects a frame and a double-click enters it. `Enter` also enters the one selected frame, while `Escape` or a click outside exits. Entry fits the camera to the frame. The iframe ignores pointer events until entered. Sources: [`canvas.tsx`](../src/ui/canvas/canvas.tsx), [`frame-shell.tsx`](../src/ui/canvas/frame-shell.tsx).

The visible feedback is limited. The global control says `Live`, and the entered frame also replaces its name with `live · esc exits`. The outline used for an entered frame is the same outline used for a selected frame, although resize handles disappear. Sources: [`app.tsx`](../src/ui/app.tsx), [`frame-label.tsx`](../src/ui/canvas/frame-label.tsx), [`overlays.tsx`](../src/ui/canvas/overlays.tsx).

This makes `Live` mean both "frames are running" and "this frame owns my input."

## The established patterns

| Pattern | Products | Entry | Exit and feedback |
|---|---|---|---|
| Drill into the object | Figma, tldraw | Figma selects the parent on click, then double-click or `Enter` descends one level. tldraw's unlocked iframe embeds select on click and receive pointer events after double-clicking into edit mode. | Figma uses selection outlines and hierarchy. tldraw exits on outside click or `Escape`. |
| Make content direct and move it through chrome | Miro, locked tldraw embeds | Miro moves or selects a frame through its border or title, leaving objects inside independently selectable. A locked tldraw embed is directly interactive and cannot be moved accidentally. | There is no local entry state to explain. Selection and interaction have separate hit targets. |
| Use an explicit preview surface | Figma, Framer, Magic Patterns | A toolbar Play or Preview action opens a dedicated preview, often from the selected frame. | Figma's inline viewer has its own controls and close button. Framer opens a separate preview mode with Close and `Escape`. Magic Patterns opens a separate window. |
| Use an explicit focus workspace | Miro formats and prototypes | Select the format, then choose Focus mode from its context menu. | The format opens full-screen and a persistent `Go to canvas` action appears at the top. |
| One-click activation with a visible gate | Excalidraw embeds | Hovering the central third of an iframe embed shows `Click to interact`; one click activates pointer events. | Clicking outside deactivates it. Active embeds use a four-pixel selection border instead of the normal one-pixel border. |

Sources:

- Figma selects a parent by default; double-click or `Enter` goes one level deeper, `Shift+Enter` goes to the parent, and Command/Control-click deep-selects: [Select layers and objects](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects).
- tldraw's iframe-specific rule is click to select, double-click to interact, then outside click or `Escape` to exit. Locked embeds are directly interactive: [Embed shape](https://tldraw.dev/sdk-features/embed-shape). Its generic editable-shape state also supports `Enter`: [Editable custom shape](https://tldraw.dev/examples/editable-shape).
- Miro selects and moves a frame by its border or title: [Frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames).
- Figma opens a separate inline Preview or presentation view. The inline viewer has back, forward, restart, scaling, and close controls: [Play your prototypes](https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes).
- Framer uses a Play button or `Cmd/Ctrl+P` to open a separate preview mode, then Close or `Escape` to leave it: [Previewing your site](https://www.framer.com/help/articles/how-to-preview-your-site/).
- Magic Patterns selects a starting screen, then uses a top-toolbar Play button to open the prototype in a separate window: [Linking Screens Together](https://www.magicpatterns.com/docs/documentation/projects/prototyping).
- Miro Focus mode is entered from a selected format's context menu, opens full-screen, and exposes `Go to canvas` at the top: [Formats and Focus modes](https://help.miro.com/hc/en-us/articles/26711034117138-Formats-Focus-modes). Its prototype-specific documentation uses the same select-then-Focus pattern: [Miro Prototypes](https://help.miro.com/hc/en-us/articles/26654269713682-Miro-Prototypes).
- Excalidraw's current source shows the hover gate, central-third hit area, delayed one-click activation, outside-click deactivation, pointer-event handoff, hint copy, and thicker active border: [activation logic](https://github.com/excalidraw/excalidraw/blob/f179f7ffd23cd47a8f013c3fd0051cb07a83d1d6/packages/excalidraw/components/App.tsx#L1479-L1600), [pointer handoff and hint](https://github.com/excalidraw/excalidraw/blob/f179f7ffd23cd47a8f013c3fd0051cb07a83d1d6/packages/excalidraw/components/App.tsx#L1924-L2002), [outside-click exit](https://github.com/excalidraw/excalidraw/blob/f179f7ffd23cd47a8f013c3fd0051cb07a83d1d6/packages/excalidraw/components/App.tsx#L7358-L7375), [`Click to interact` copy](https://github.com/excalidraw/excalidraw/blob/f179f7ffd23cd47a8f013c3fd0051cb07a83d1d6/packages/excalidraw/locales/en.json#L261), and [active border](https://github.com/excalidraw/excalidraw/blob/f179f7ffd23cd47a8f013c3fd0051cb07a83d1d6/packages/excalidraw/renderer/interactiveScene.ts#L954-L989).

## What the comparison says

The closest direct precedent for Spool's current behavior is tldraw's unlocked embed: click selects, double-click enters, outside click or `Escape` exits. Figma's double-click pattern is about descending a design hierarchy, not playing a prototype.

The lower-friction in-canvas alternatives are:

```text
Miro / locked tldraw
frame border or title  → select, move, resize
frame content          → interact immediately

Excalidraw
hover live frame       → show "Click to interact"
click live frame       → enter
outside click / Escape → exit

Preview products
select frame           → Play
dedicated preview      → interact
Close / Escape         → return
```

No reviewed product uses crossing a zoom threshold as the sole signal to hand pointer ownership to embedded content. Figma exposes zoom-to-selection separately from selection and preview, while the preview tools use an explicit Play, Preview, or Focus action. Zoom commonly accompanies focus, but does not replace an entry gesture. Sources: [Figma zoom controls](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options), [Figma prototype preview](https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes), [Miro Focus mode](https://help.miro.com/hc/en-us/articles/26711034117138-Formats-Focus-modes).

The consistent feedback rule is stronger than any particular trigger: when input ownership changes, the products either remove the canvas entirely, show a persistent way back, or visibly gate and strengthen the active object. A selection-colored border by itself is not the common mode signal.
