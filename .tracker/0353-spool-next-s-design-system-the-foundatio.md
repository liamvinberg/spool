# #353 · spool-next's design system: the foundation, the core primitives, themes

- State: open
- Labels: wayfinder:prototype
- Created: 2026-11-13T19:06:13.822Z
- Updated: 2026-11-13T23:30:48.505Z

## What this is

spool-next's design system: the look, the feel and the core primitives all of its UI is built from. Liam: "here we should just establish the look, feeling, the core that all ui will kind of build upon, this is really important that we establish this". Held by task 679 (/brain). It follows the look exploration of task 666 on the rethink canvas.

## Decided (task 679, 2026-11-15)

**The look is spark and hearth as drawn on the rethink canvas**, followed literally (`~/dev/projects/spool-rethink/design/shared/pieces/look/spark` and `hearth`), with spark's animated icons. Liam: "from devosurf/rethink i like hearth or spark from there". Whether they stay two themes or become the light and dark side of one is his call once the exact port is up.

**Three layers.** Liam: "the foundational ui primitives that everything kind of builds upon ... the tokens, colors feeling is foundational".
1. **Foundation: the tokens.** Colour roles, type, spacing (4px grid), corners, edges and shadows, motion timings, plus the icons and the mark. This is the look and the feeling. Nothing above it holds a value of its own.
2. **Core: the primitives.** Button, icon button, text field, number field, select, slider, toggle, checkbox, radio, segmented control, tabs, menu, popover, dialog, tooltip, toast, badge, avatar, key, list row, tree row, separator, pane surface. They read tokens only.
3. **Composed: parts made from the core** (a properties row, the actions list, the share menu). Reused in a few places but not foundational: they live with their feature and may only use the core.

**Configurable by themes.** Liam: "build it in a way that makes it configurable, so you can make spool feel however you want it to ... tactile if you want, depth if you want". A theme is one plain file of token values. Spark and hearth are the first two; another is one more file, with no change to a component. Motion timings are tokens, so a theme changes the feel too. A theme changes values, not shapes: a token or variant is added only when a real theme needs it. No theme editor now.

**Not core, waiting until spool's interactions are decided** (the rethink, task 655): the composer, the agent's mark, the reference token, the tab strip, the path, how panes behave, the canvas, the find palette. The window in the frames is a demo of the core applied, not part of what is locked.

**Given, never a theme's call:** spool's mark (`SPOOL_MARK_PATH` in `src/brand.ts`) verbatim, and spool red `#f5391a`. The dev build keeps its blue mark.

**Clean and small.** Liam: "without overengineering anything just clean and smooth". Whatever exists for flexibility nobody asked for is removed.

## Tried and turned down

- **Looks computed from sliders** (a tuner with 17 inputs, ten looks drawn from it: hairline, plush, bold, ink, blush, depth, lacquer, sage). Liam liked none; the engine and tuner are removed. What it taught: his taste is in the crafted specifics of spark and hearth, not in a parameter space.
- **Four more icon families** (solid, fine, point, ribbon). "maybe just spark?": deleted.
- **A colour per kind of thing** (hue): on a canvas the content is the colourful part.
- **A feel pass over the whole window, and a frame-rate harness on the m1**: premature while interactions are undecided. The harness belongs with the port.

## Gates (Liam's rejections)

No brutalism, Swiss, editorial, paper, blueprint, terminal or instrument looks. No glow, heavy glass or decorative gradients. No serif, display or odd fonts. No shadow cards, eyebrow labels, em-dashes or placeholder copy. No chrome that hides until reached for. Clean, modern, its own identity, never quirky, familiar to Figma people. Settled by the rethink: no tool bar, no agent side pane, composer centred at the foot.

## Where it lives

- Canvas: https://spool.page/devosurf/spool-next, local at `~/dev/projects/spool-next/design` (`shared/system/`). Its `AGENTS.md` holds the layout and the laws.
- Briefs and state: `~/.brain-archive/spool-next-design/`.
- The originals: the rethink canvas, `explore/look/spark-*` and `hearth-*`.

## Steps

1. **Exact port** (running): spark and hearth as plain token files, every core primitive and the demo window equal to the originals, shown to Liam as A/B pairs.
2. **The core, clean**: each core primitive has all its states, and its hover, press and focus are clean. No new behaviour.
3. **Freeze**: one kit frame, and a short `DESIGN.md` with the three layers, the roles, the primitives and the rules a new screen follows.
4. **Port** into spool-next's code, with a lint for the layer rule. Blocked by #345 (language and shell).

## Done

Liam confirms the A/B pairs; the kit frame shows the foundation and the core in both themes and both schemes; the three layers and the theme rule are written down; a fourth theme could be added as one file.

## Comments

### agent, 2026-11-13T23:30:48.505Z

Steps 1 to 3 done (task 679, 2026-11-16).

- **Exact port**: spark and hearth equal the rethink originals at rest (A/B shots judged by the brain; hearth uses spark's icons by Liam's choice, and the mark is the true ribbon where the originals drew bars).
- **The core, clean**: `ui/` holds only the core, `composed/` the rest; `system.css` and `ui/` name no theme; a theme is one file (209 roles, the same set in both). Fixed: radio arrow keys, tooltip Esc, popover's `aria-haspopup`. A throwaway third theme loaded on the kit without touching a component.
- **Freeze**: `design/DESIGN.md` on the canvas (layers, themes, foundation, core, rules) and the kit frame ordered Foundation, Core, Composed.

Decided by Liam: spark's icons in both themes; spark and hearth stay two themes, each light and dark.

Left: step 4, the port into product code with a lint for the layer rule, blocked by #345. Open for the port: three original parts under contrast floors (listed in DESIGN.md); hover colour fades are paint, not transform or opacity; motion was compared at three frozen moments only.
