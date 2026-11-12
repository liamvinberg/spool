---
summary: Tailwind, tokens.css, cn(), motion
---

Tailwind v4, compiled at serve: write utility classes in JSX and the document arrives with finished CSS — theme, preflight, exactly the utilities your source uses. No config file, no directives, no build step of yours; the compiler is spool's, pinned per format version, arbitrary values and variants all working.

Tailwind v4 puts important at the end: mt-3.5!, not !mt-3.5.

Use Tailwind classes for component layout, spacing, colors, borders, and interaction states. Preserve exact values with arbitrary utilities when needed. Keep shared tokens, fonts, typography roles, keyframes, and complex selectors or effects in CSS; keep calculated positions, sizes, and zoom in inline styles. Give each property one owner instead of repeating it in classes and CSS.

Custom CSS remains supported: use a <style> element for a frame-local effect or import a plain .css file, including existing product component styles. Imported component CSS sits below utilities in the project layer, so a utility can override it. transitions.css and fonts.css stay plain CSS.

Compose classes with cn() from shared/lib/utils.ts — cn() only, never template-literal class strings. Variant components ride cva (pinned).

Tokens live in shared/tokens.css, the project's token file and the only stylesheet the Tailwind compile reads for a frame without a theme (plus its relative @imports; @plugin and @config are not supported):
  - distilled from a product: paste its variables into :root verbatim, names kept
  - born in spool: declare under @theme, and utilities pick them up (--color-surface → bg-surface)
  - bridging: @theme inline aliases existing :root variables into utility names
One file, both blocks — shadcn v4's shape. Non-Tailwind consumers can import the same file; browsers skip @theme.

Fonts: shared/fonts.css is injected into every frame without a theme — @import url(...) for hosted fonts, @font-face with absolute/data src, or @font-face whose url() is a relative path from that file (shared/assets/fonts/local.woff2), which spool reads and carries in the document up to 1 MB. woff2, woff, ttf, otf.

Themes: a frame may import a theme for a look of its own, the way a Vite app's entry imports its index.css — two design systems side by side, or a product and its marketing site, in one project. A theme is a stylesheet that imports tailwindcss; any other stylesheet stays plain component CSS.

  // frames/vercel/buttons/frame.tsx
  import "shared/ui/vercel/theme.css";

  /* shared/ui/vercel/theme.css */
  @import "tailwindcss";
  @theme { --color-primary: #000; }
  @font-face { font-family: "Geist"; src: url("../../assets/fonts/geist.woff2"); }

For that frame Tailwind compiles from the theme instead of tokens.css, and fonts.css is not injected: nothing project-wide reaches it, on the canvas, in the player and in an export alike. A theme carries its own fonts under fonts.css's rules, a relative url() resolving from the theme's own folder; its relative @imports resolve as tokens.css's do, and only those: write "../../tokens.css", not the shared/ path a frame's import may use. An @import url(...) for a font may follow @import "tailwindcss". One theme per frame: a frame whose imports reach two fails to compile, naming both. Shared components never import a theme: they use token names like bg-primary and wear the theme of whichever frame uses them. A frame that imports no theme uses tokens.css and fonts.css.

Motion is for interaction feel — the motion library is pinned (import { motion } from "motion/react"): hover, press, drag, springs, layout animation inside a frame. Screen-to-screen motion is never animated from a frame; it belongs to the flow layer (topic: flows). Other animation libraries: add them to the import map.

The document's baseline: preflight (the same zero a product starts from), tokens, fonts, height chain at 100%. Frames add nothing global — no resets, no font stacks in components; identity lives in tokens.
