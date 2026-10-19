# #133 · styling: let a frame import its own theme and fonts

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.691Z
- Updated: 2026-10-18T17:44:01.341Z
- Closed: 2026-10-18T17:44:01.341Z

Moved from liamvinberg/spool#341 (closed there; GitHub issues are no longer where this work is tracked).

Related to #129: a deck or a brand with its own look is exactly a frame choosing its own theme and fonts. The designers in agent-hub task 126 had to inject font s by hand.

## Problem

Every frame in a project compiles against one theme. Tailwind reads only `shared/tokens.css`, and every frame document receives `shared/fonts.css`. Two frames in the same project cannot have independent looks: two unrelated design systems side by side, or a product app and its marketing site, have to share one set of tokens and fonts or live in separate projects.

A frame should choose its look the way a Vite app's entry imports its `index.css`: by importing it.

```
// frames/vercel/buttons/frame.tsx
import "shared/ui/vercel/theme.css";
```

```
/* shared/ui/vercel/theme.css */
@import "tailwindcss";
@theme { --color-primary: #000; }
@font-face { font-family: "Geist"; src: url("../../assets/fonts/geist.woff2"); }
```

## Behavior

- **What makes a stylesheet a theme.** A stylesheet that imports `tailwindcss`, the standard Tailwind v4 entry form, is a theme. When a frame's import graph reaches one, directly or through a component, it is that frame's theme. Stylesheets that do not import `tailwindcss` stay plain component CSS, exactly as today. No stylesheet in an existing project is affected unless it already imports `tailwindcss`.
- **One theme per frame.** A frame whose imports reach two different themes fails to compile with an error naming both.
- **A theme replaces the defaults.** For that frame, Tailwind compiles from the theme instead of `shared/tokens.css`, and `shared/fonts.css` is not injected. Nothing from the project-wide files leaks in. The layer order and Spool's pinned Tailwind stay as they are ([tailwind.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/daemon/tailwind.ts#L38-L42)).
- **A theme carries its fonts** under the rules `fonts.css` has today: a hosted `@import url(...)`, `@font-face` with an absolute or data `src`, or `@font-face` whose `url()` is a relative path to a woff2, woff, ttf or otf file, carried in the document up to 1 MB. Plain component CSS keeps rejecting `url()` into project assets ([compile.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/daemon/compile.ts#L414-L426)).
- **No theme means no change.** A frame that imports no theme compiles against `shared/tokens.css` and receives `shared/fonts.css`, as today. No migration and no format bump.
- **Relative imports** inside a theme resolve as they do in `tokens.css` today. `@plugin` and `@config` stay unsupported.

## Every surface that renders a frame

- Canvas frame documents ([compile.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/daemon/compile.ts#L255-L296)): the theme's stylesheets and font files are cache inputs, so editing a theme reloads the frames that use it and only those.
- The player ([play.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/daemon/play.ts#L255-L315)): a walk happens in one document, so a walk between frames with different themes switches tokens and fonts along with the frame. Fonts are currently one block for the whole walk.
- Export and publication ([capture.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/publication/capture.ts), [build.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/publication/build.ts)): a published frame carries its own theme and fonts.
- The properties rail's theme-derived menus ([theme.ts](https://github.com/liamvinberg/spool/blob/f31eede8f20d1455a4caee5ecee38346bce73abd/src/daemon/theme.ts)) read the held frame's theme, not the project's.

## Contract

The `styling` topic of `spool skill` documents this: a frame may import a theme; a frame with none uses `shared/tokens.css` and `shared/fonts.css`; shared components use token names like `primary` rather than importing a theme, so a component wears the theme of whichever frame uses it. Update the layout listing in the `frames` topic, and the `tokens.css` and `fonts.css` scaffold comments in `src/templates.ts`, where they call themselves the single token file.

This changes published behavior, so it lands with a changeset per `docs/releases.md`.

## Tests

- Two frames in one project with different themes render different tokens and fonts, and neither leaks the project defaults.
- A frame without a theme is byte-identical to today's output.
- Two themes reached by one frame fail with an error naming both.
- Editing a theme invalidates only the frames that reach it.
- A player walk across two themed frames shows each frame with its own tokens and fonts.
- A published export of a themed frame carries its theme and font files.

*From Linear DEV-284.*

Related: #129

Plane: SPOOL-133

## Comments

### agent, 2026-10-18T17:44:01.330Z

**Liam, 2026-10-13:** Built in agent-hub task 146 (spool 9ecb0aae on main, changeset minor): a stylesheet that imports tailwindcss is a frame's theme; unthemed frames compile byte-identically. Left: in the player a frame reaching two themes fails the whole player, not just that frame; a theme's relative url() to non-font assets isn't carried on the canvas.
