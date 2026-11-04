# #220 · knobs: tune a frame's values by hand from the properties rail

- State: open
- Labels: enhancement, ready-for-agent
- Tasks: task 402 (Agent-defined tweakable frame properties)
- Created: 2026-11-03T20:32:03.414Z
- Updated: 2026-11-04T00:15:23.620Z

Knobs: values a frame declares for a person to tune by hand in the properties rail, live while dragging and written back into the frame's TSX on release. Decided with Cata in task 402 (grilling, research, two design rounds). Decision record: docs/adr/0012-knobs-a-hand-tunes-what-an-agent-declares.md (amends ADR-0009). Glossary: **Knob**.

## The contract

```tsx
import { ui } from "spool";
const k = ui.knobs({
  card: {
    radius: { type: "corners", value: 20, min: 0, max: 40 },
    padding: { type: "spacing", value: [20, 22], min: 0, max: 64 },
    badge: { type: "toggle", value: true },
  },
  motion: {
    ease: { type: "easing", value: [0.2, 0, 0, 1] },
    spring: { type: "spring", value: { duration: 0.35, bounce: 0.3 } },
    replay: { type: "action", label: "Replay entrance" },
  },
});
// k.card.radius, k.motion.spring, ...; an action is ui.knobs' onAction or a subscription, implementer's call
```

- A design-time value: never `ui.state`; no scenario or play session resets it; it has its own store in the runtime.
- Each `value` is a literal in the call and the one record of it. A computed value shows read-only with the reason.
- A nested object is a folding group, in code order.
- Shared knobs live in a shared file outside `shared/ui/` (e.g. `shared/knobs/kaffe.ts` exporting the call); `shared/ui/` components keep taking props and never import `spool` (the compile rule stays). The rail marks a shared knob and names its file; its value is one for every frame reading it.
- Opt-in: frames without knobs are unchanged.

## Types
slider (min, max, step, unit), range, stepper, angle, xy, color (alpha), gradient, toggle, segmented, select, pictures (options with an image or icon), text, longtext, font, weight, image, icon, spacing (1, 2 or 4 sides), corners (1 or 4), shadow, duration, easing, spring, action (no value, nothing written). Exact type names and option fields are the implementer's to settle; keep them few and obvious.

## Where and how
- A Knobs section under the geometry in the properties rail for the selected frame (and for an element's frame). Editors only: never in the player, a share or the viewer for outsiders.
- At rest each knob is one calm row: name and a value preview (swatch, number, tiny curve). A press opens that row in place into its full editor; one open at a time; the open row keeps its y and only rows below move; fixed editor heights. A row opening low glides the rail just enough to show its editor. Font, icon and select open as a popover beside the row. Toggle, stepper, segmented, text and action act in the row and never open.
- A status line at the section's foot: while dragging `key from → to` and "esc puts back"; after a write the file and line (`frame.tsx:29 radius 18 → 24`, `shared/knobs/kaffe.ts:4 …`), then quiet.
- "Save as variant" copies the frame as `<name>--b` (next free) with the current values, placed beside it.
- Teammates see a change on release through the ordinary save.

## Interaction rules (every knob)
1. Drag the label to scrub; click the value to type. Typing takes units and maths (`300ms`, `78*2`, `+4`); unit as a suffix; clamp on commit.
2. Numbers: Shift ×10, Alt ×0.1, arrows step, a held arrow is one write; scrub slows as the pointer moves away from the row; detents, always including the value it started from. On the spacing and corner diagrams Figma's habits instead: Shift snaps to 4, Alt moves the opposite side too.
3. Hover tries on (fonts, pictures, icons, presets, select options, palette swatches); only a press writes.
4. Esc puts back the value from before the gesture and writes nothing; outside a gesture it backs out one level.
5. One gesture, one write, one undo step (the canvas's ⌘Z/⇧⌘Z); an undone row washes and scrolls into view. No Reset.
6. Feedback on the frame within 0.1 s; drags at 60 fps (values are posted into the running frame, no recompile during a drag).
7. Keyboard: ↑/↓ walk rows and group heads, ⏎ opens and closes, ←/→ step; focus returns to the row on close.

## Reference designs
On the team canvas, `design/frames/explore/knobs/` (fetch with `pnpm -s dev open .`): `knobs-open` is the chosen shape. Take each family from the round-2 take that pushed it:
- `knobs-open-numbers`: the one number engine (scrub, typing, detents, keys, Esc), slider, range, stepper, angle, xy, duration, easing, spring (Time: duration + bounce, Physics tab).
- `knobs-open-colour`: color (HEX/RGB/HSL/OKLCH, palette try-on), gradient (fixed height), font and icon popovers, weight (only the family's weights), pictures and image grids.
- `knobs-open-box`: spacing and corners as diagrams at real size with the card tracing what is pointed at, shadow (lift to grow), toggle, segmented, select popover, text, longtext, action, and the section as a whole (groups, shared mark, status line, undo wash, keyboard walk, Save as variant).
Research with sources: comment on this ticket.

## Build notes (from the code check, see the feasibility comment)
- Stamp `ui.knobs(...)` calls at compile time (stamps cover JSX only today); inject without moving line or column (`design-compile.ts` onLoad).
- Frame → host message with the schema and stamp; host → frame message with live values (template: shared state in `frame-runtime.ts` and `protocol.ts`).
- A fifth write-lane op, `set-knob` (path + literal), modelled on `planSupplied` in `hand-write.ts`; refuse a non-literal with its own refusal code; suppress the frame's reload on its own write's echo; a shared file's write reloads the other frames.
- Controls become primitives in `src/ui/primitives/` on theme roles (design-lint), synced to `system/` sheets by `pnpm design:sync`.

## How agents learn it
One `knobs` topic in `src/skill.ts` (`spool skill knobs`) and one line in the overview pointing at it: when to add knobs (the 3 to 8 values on a frame that need taste, never every style), the call and types, shared knobs outside `shared/ui/`, literals only, and keep values a person tuned when rewriting a file. No other skill or doc.

## Done when
- The above works on a real project end to end: declare, tune live, release writes the literal, undo, shared knob across frames, Save as variant.
- Tests per AGENTS.md (each behaviour once, at the cheapest level), `pnpm test`, `pnpm typecheck`, `pnpm check` pass.
- A minor changeset; the release published (release PR merged, npm and the Mac app's GitHub release out).
- Design adopted: `app/` gains the shipped Knobs rail frame(s), `explore/knobs/` and its `Questions` row in `design/AGENTS.md` go.

## Later
`token` hint for porting to an app variable; Spool-made stills for picture options; hover a knob to outline what it affects.

## Comments

### agent, 2026-11-03T21:12:54.135Z

## Research: knob interaction patterns (task 402)

# Knob interaction patterns — research notes (spool #402)

Context: knobs = values an agent declares with `ui.knobs({...})`; drag moves the running frame, release writes the literal through the write lane (ADR-0012: no Reset beyond undo/history; computed values read-only). Chosen direction: one compact row at rest (name + value preview), press opens the full editor in place.

Confidence key: **[P]** primary source fetched; **[I]** my inference / not confirmed from a primary source.

## 1. Per-type recommendations

| Type | Recommended pattern | Source |
|---|---|---|
| **Slider (+unit)** | Row = label + number with unit suffix. Open = track + typed number linked (coarse + fine); the number is a scrub target and typeable; unit shown as suffix, kept on typing. Never the slider alone: sliders are for approximate values; pair with a text field. | Apple HIG Sliders ("consider supplementing a slider with a text field and stepper") [P] https://developer.apple.com/design/human-interface-guidelines/sliders ; NN/g linked coarse+fine controls [P] https://www.nngroup.com/articles/sliders-knobs/ ; Framer `ControlType.Number` (min/max/unit/step, input + slider default) [P] https://github.com/framer/plugins/blob/main/packages/code-link-cli/skills/references/PROPERTY_CONTROLS.md |
| **Range (min–max)** | Two-thumb track with two typed numbers; thumbs cannot cross; Tab order fixed regardless of position. | W3C APG multi-thumb slider [P] https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/ |
| **Stepper** | A number field with −/+ at the edges (or inside the open editor); Shift = ×10. Stepper alone shows no value, so it must sit beside the value. Use for small integer counts, not for wide ranges. | Apple HIG Steppers (Shift-click ×10) [P] https://developer.apple.com/design/human-interface-guidelines/steppers ; Framer `displayStepper` [P] |
| **Angle** | Number field in degrees + a small dial you drag around; Shift snaps to 15°; circular control only because angles wrap. Row preview = the number + a tiny rotated tick. | Apple HIG (circular slider "when values repeat/continue", rotation 0–360) [P] https://developer.apple.com/design/human-interface-guidelines/sliders ; Figma rotation: Shift snaps to 15 [P] https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions ; Framer Number `unit:"deg"` [P] |
| **XY pad** | Square pad with grid-snapping on clicks, Shift locks an axis, arrow keys step (Shift ×10), Home/double-click resets, Esc cancels drag; two typed numbers beneath. | DialKit XY pad [P] https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md ; Leva joystick (Shift = coarser, Alt = finer) [P] https://github.com/pmndrs/leva/blob/main/docs/getting-started/inputs.md ; Tweakpane Point2D [P] |
| **Colour (+alpha)** | Row = swatch + hex (hex is editable in the row itself). Open = SV area, hue slider, opacity slider, format switcher (HEX/RGB/HSL/OKLCH), eyedropper, and the doc's own colours. Alpha is its own slider, not part of the area. | Figma colour picker [P] https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker ; DialKit (hex/OKLCH/P3, hue + opacity) [P]; Apple HIG colour wells (click → picker, drag colours between wells) [P] https://developer.apple.com/design/human-interface-guidelines/color-wells |
| **Gradient** | Row = gradient bar swatch. Open = bar with draggable stops (click bar to add, Delete removes), selected stop opens the colour editor, plus type + angle. Angle/handles on the canvas is Figma's way; for a rail, a typed angle field is the fallback. | Figma gradients [P] https://help.figma.com/hc/en-us/articles/34208860210199-Use-gradients-as-a-fill-or-stroke |
| **Toggle** | Whole row is the hit target; the value is the switch (no open step — one press flips). | DialKit toggle (as on/off segmented) [P]; Framer Boolean [P] |
| **Segmented** | Show segments directly at rest when ≤ ~4 short options (nothing to "open"); arrows move, Home/End jump. | Framer `displaySegmentedControl` [P]; Theatre `stringLiteral as:'switch'` [P] https://www.theatrejs.com/docs/latest/manual/prop-types ; DialKit keyboard map [P] |
| **Dropdown** | Row shows the current label; press opens a popover menu anchored to the row (long lists don't fit a rail). Typing navigates, Esc returns focus to the row. Hover over an option previews it on canvas. | DialKit select keyboard [P]; Figma effects menu "hover each option to preview" [P] https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers |
| **Picture choice** | Grid of thumbnails in the open row; arrows move, Enter selects; hover = try-on. Optional upload is out of scope for spool (write lane writes literals) — keep it an agent-declared set. | DialKit Image control (options with labels, arrows/Enter/Esc) [P]; Framer ResponsiveImage [P] |
| **Text** | Single-line field in the row itself; Enter commits, Esc reverts. | DialKit text [P]; Framer String [P] |
| **Long text** | Same row, opens to a textarea that grows up to ~5 lines then scrolls; Enter inserts newline, commit on blur / Cmd-Enter [I for the commit key]. | DialKit ("grow up to five lines, then scroll; Enter inserts a line break") [P]; Framer `displayTextArea` [P] |
| **Font** | Row shows name set in the font. Open = searchable list with filters; **hovering a font previews it on the selected text live**. | Figma Browse and apply fonts [P] https://help.figma.com/hc/en-us/articles/360041308034-Browse-and-apply-fonts ; Framer Font control (family + variant + size/line-height/tracking subset) [P] |
| **Font weight** | Segmented/stepped list of the weights the chosen family actually has, each rendered in its own weight; not a free 100–900 slider unless the font is variable. | Figma weight dropdown within font picker [P-ish]; Framer Font `variant` [P]. Exact Figma weight UI not confirmed [I]. |
| **Image** | Thumbnail row; open = grid of the agent's offered images (+ clear). | DialKit Image [P]; Theatre `types.image` (asset handle) [P] |
| **Icon** | Row shows the glyph; open = search box + grid, type-to-filter, arrow nav, hover try-on. No primary source found for a best-in-class icon field; this is the font/picture pattern applied. [I] |
| **Spacing (4 sides)** | Row = compact `16` or `16 24` or `8 16 8 16` preview. Open = one number (all sides) with a "split" toggle revealing 4 fields in a cross layout; while split, **Option/Alt = opposite sides, Shift = all sides** on drag and on typing; Option-click a value clears it. | Webflow spacing [P] https://help.webflow.com/hc/en-us/articles/33961243177875-Spacing-margin-and-padding ; Figma auto-layout padding (uniform / H+V / per side; Alt = opposite, Alt+Shift = all) [P] https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma ; Framer Padding/BorderRadius (CSS shorthand) [P] |
| **Corner radius (4)** | Same shape as spacing: one value at rest; "independent corners" toggle reveals 4 fields laid out at the corners; Alt isolates one corner on canvas. | Figma corner radius [P] https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing ; Framer BorderRadius [P] |
| **Shadow** | Row = tiny swatch of the shadow + "0 4 12". Open = the parts as number fields (x, y, blur, spread) + colour swatch, with inner/drop as a segmented. Figma puts these in an "effect settings" popover from the row. | Figma shadows [P] https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers ; Chrome DevTools shadow editor (blur/spread sliders or typed) [P] https://developer.chrome.com/docs/devtools/css/reference ; Framer BoxShadow [P] |
| **Duration** | Number field in seconds (suffix `s`; accept `300ms`); small range, fine step (0.01–0.05), with a replay-on-change. Show it in the transition editor as a time axis when it belongs to an easing/spring. | Webflow time units accepted by typing [P] https://help.webflow.com/hc/en-us/articles/33961290465043-Input-values-and-units ; DialKit transition editor [P] |
| **Easing (curve)** | Square curve editor with 2 draggable handles + the 4 numbers + a **preset strip** (ease, in/out, out-cubic…) + a **moving-dot preview** with replay. Handles move by arrow keys (0.01; Shift 0.1); Esc cancels a drag. Allow y outside 0–1 (overshoot). | cubic-bezier.com (drag + compare curves) [P-search] https://cubic-bezier.com/ ; Chrome DevTools Easing Editor (presets switcher + drag control points) [P] https://developer.chrome.com/docs/devtools/css/reference ; DialKit [P] |
| **Spring (preview)** | Default to **perceptual** params: *visual duration* + *bounce* (−1…1), live curve **and** a moving preview; "Physics" tab (stiffness / damping / mass) as the advanced mode; switching modes keeps each mode's edits. | Apple `Spring(duration:bounce:)` [P] https://developer.apple.com/documentation/swiftui/spring ; Motion `visualDuration`/`bounce` [P] https://motion.dev/docs/spring ; DialKit Time/Physics modes [P]; Origami Spring Converter (duration+damping ↔ tension/friction) [P] https://origami.design/documentation/patches/builtin.springconverter |
| **Action button** | A full-width row labelled by the verb ("Replay"); press runs it; it has no value and is not written anywhere. Put it in the same stack, not in the editor. | DialKit actions [P]; Framer EventHandler [P] |

### Notes behind a few rows

- **Number fields everywhere**: Figma scrubs by dragging the label (or Option-hover on the field), with 4 speeds (2×, 1×, ½, ¼) chosen by cursor *vertical position*, a toast showing the speed, and it keeps scrubbing when the cursor leaves the screen [P] https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions . Webflow: Option+drag in the field [P]. Leva: drag the label or the inner label; arrows with Alt ±0.1 and Shift ±10; step inferred from the initial value [P]. Chrome DevTools: Up = 1 (0.1 between −1 and 1), Shift ×10, Cmd/Ctrl+Shift ×100, hover a unit shows ↔ cursor and drag; click unit to pick another [P]. Theatre.js: Alt-drag a number prop for reduced speed; `nudgeMultiplier` per prop; range is only a visual guide, not validation [P] https://www.theatrejs.com/docs/latest/manual/keyboard-shortcuts , https://www.theatrejs.com/docs/latest/manual/prop-types .
- **Math in fields**: Figma accepts `+ − * / ^ ( )`, relative to the current value (`(x/2)+6`), and applies to mixed selections (`Mixed+100`) [P]. Webflow: `78px * 2`, types a unit to change it; px→% auto-converts [P] https://help.webflow.com/hc/en-us/articles/33961290465043-Input-values-and-units .
- **DialKit specifics worth copying**: default step by magnitude (0.01 ≤1, 0.1 ≤10, 1 ≤100, 10 above) and bare number → range = 0…3× value; click or drag the slider; focus + Enter to type; hovering the number briefly then clicking types; Escape cancels a drag; Home resets; scroll/key-held shortcuts with fine = 1 % of range, coarse = 10 % [P] https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md . Panel is draggable, folders collapse, `inline` or `popover` mode [P] https://joshpuckett.me/dialkit .
- **Tweakpane**: number = text input by default; min+max → slider added; `format`; colour/point pickers can render `picker: 'inline'` with `expanded: true` (in place) or as a popup (default) [P] https://tweakpane.github.io/docs/input-bindings/ .
- **Leva**: Vector `lock` option moves coordinates together [P] — same idea as Webflow/Figma "all sides". Pointer-lock for scrubbing landed in leva (PR #465) [P-ish: changelog] https://github.com/pmndrs/leva/pull/465 .
- **Not found / not confirmed**: Rive, Spline, Linear and Raycast field patterns — searches returned nothing primary; Theatre.js colour/compound editor details beyond the prop-types page; macOS colour panel (HIG only says "use the system picker"); Framer's own spring/easing editor docs (the developer page for property controls only says "Transition: editing Framer Motion transition options"; the Academy lesson mentions a graph editor and time-based springs but I didn't get a fetched spec).

## 2. Cross-cutting patterns

### Scrub-to-change
- Drag the **label** (cursor `ew-resize` on hover) — Figma, Leva, Webflow(Option+drag in field). Dragging the **value** is also fine where the value is not a text target (DevTools unit; DialKit slider track). Click without movement on the number = type. [P]
- Modifiers: Shift coarse (×10), Alt/Option fine (×0.1) — Leva, Theatre, DevTools, Figma nudge (Shift = big nudge, default 1/10) [P]. Figma adds vertical-position speed bands (2×, 1×, ½, ¼) which avoids needing a modifier on touchpads. Procreate does the same on touch: drag the slider away from the track, the further away the finer [P] https://help.procreate.com/procreate/handbook/interface-gestures/gestures .
- **Pointer lock** so a scrub never hits the screen edge: Ark UI's scrubber uses the Pointer Lock API with a virtual cursor, notes browsers may show a notification, and disables it in Safari [P] https://ark-ui.com/docs/components/number-input ; MDN: lock isn't bounded by screen edges and gives `movementX/Y` [P] https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API . Figma achieves the same effect ("keeps scrubbing off screen") [P]. Fallback: pointer capture + wrap.

### Typing, units, math
- Typing accepts expressions relative to the current value and unit suffixes; the field shows the unit only as a suffix (Figma, Webflow) [P]. Clamp to `min/max` on commit (DialKit "values are clamped") [P]; Theatre's range is just a visual guide so typing outside it works [P] — choose per knob; recommended: slider range soft, declared `min/max` hard only when the agent says so [I].

### Keyboard
- Slider: arrows = step, Shift+arrow / PgUp/PgDn = 10 steps, Home/End = bounds; Enter on a slider opens its number editor; Enter commits, Esc cancels, Tab commits and advances; menus return focus to trigger on Esc [P] DialKit keyboard table https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md . Tooltips with the value on hover are recommended for macOS sliders [P] Apple HIG. Slider ARIA: `aria-valuetext` when the number isn't human-friendly [P] APG.

### Hover preview / try-on
- Figma previews effects on hover in the menu, and fonts on hover in the picker [P] (links above). For knobs: dropdown options, picture choices, fonts, icons, easing presets can all apply on hover and revert on leave; only press commits (so only press writes).

### Snapping and detents
- Apple: tick marks help locate values; label min/max at least [P]. DialKit pad: clicks near grid intersections snap, steps snap values [P]. Figma rotation snaps at 15° with Shift [P]. A detent at the **value on open** (and at 0/1 when in range) is [I] — worth adding because spool has no Reset.

### Reset / default
- NN/g: provide a default and an easy way back to it; Apple Photos hides Reset in a menu (criticised) [P] https://www.nngroup.com/articles/sliders-knobs/ . DialKit: Home or double-click resets pad to *configured defaults*; `resetValues()` [P]. Webflow: Option-click a value clears it [P]. **Spool constraint:** ADR-0012 makes the literal the only record, so there is no "default". Closest honest equivalents: Esc during a drag/edit reverts to the value at press (nothing written yet); a "value when opened" revert while the editor is open [I]; then undo/history.

### Mixed values
- Figma: "Mixed" shows when a selection disagrees, and typing an expression applies per-item (`Mixed+100`) [P]. For knobs: a `shared/` knob rendered by several frames is still one value (glossary), so mixed shouldn't occur; spacing/radius with sides unequal shows as the shorthand (`8 16`), not "Mixed" [I].

### How a row opens, and keeping the rail steady
- Tweakpane & DialKit do in place (folders, `picker:'inline'`/`expanded`); Figma and Webflow use popovers for heavy editors (colour picker, effect settings, corner details, font list), in-place for light ones (number, segmented) [P]. No primary source on scroll anchoring — my rules [I]: one editor open at a time; opened row keeps its y position (scroll-anchor); rows below shift, never reflow above; editor height fixed per type (no layout shift while dragging); popover only for lists that won't fit the rail (font, icon, dropdown). Press again/Esc collapses; Esc first cancels an in-progress gesture.

### Undo granularity
- Not confirmed from a primary source for Figma. Spool's own rule is clear: drag moves the running frame, release writes once → **one gesture = one write = one undo step**; typing = one on commit; keyboard repeat of arrows should coalesce [I]. DialKit's `Escape cancels an active drag` is the pre-commit escape hatch [P].

### Touch / trackpad
- NN/g: sliders are imprecise, worse on touch; keep value labels above/beside the thumb so the finger doesn't cover it; pair with a text field [P] https://www.nngroup.com/articles/gui-slider-controls/ . Procreate's finger-away-for-finer slider [P]. Trackpad has no Alt-drag-friendly path for many users → Figma's vertical speed bands, DialKit `scroll` shortcut (hold key + scroll) [P]. Scrub on touch needs `touch-action: none` on the handle [I].

## 3. Spool-specific cautions
- Live-while-dragging is cheap for CSS values but a re-render for frames; DialKit's guidance of "live feedback while tuning" [P] (Apple HIG "consider live feedback") matches; NN/g: feedback must land ≤0.1 s or sliders stop being good [P].
- Easing/spring editors need a **preview that replays** (the frame itself, via an Action row, or a built-in dot). DialKit ships replay as an action; Apple/Motion expose settling duration, useful for "will this finish before the next beat" [P].

### agent, 2026-11-03T21:13:04.283Z

## Feasibility (task 402)

All buildable. New pieces: a compile-time stamp on `ui.knobs(...)` calls (today stamps cover JSX only; rewrite in `design-compile.ts` onLoad without shifting line/col), a frame-to-host schema message and host-to-frame value message (template: shared state, `frame-runtime.ts:316-384`, `protocol.ts`), a fifth `HandOp` `set-knob` in `hand-write.ts` modelled on `planSupplied`, a knob store separate from `ui.state`, and echo suppression on release (`use-hand-edit.ts`). Missing primitives: slider track, dial, XY pad, colour/gradient, easing, spring, box editors; toggle, segmented, dropdown, number scrub exist. Blocker: `shared/ui/` may not import `spool` (`design-compile.ts`), so shared knobs need a home outside `shared/ui/`.

### agent, 2026-11-03T21:16:16.082Z

Decided round 2 (task 402): shared knobs live in a shared file outside `shared/ui/` (for example `shared/knobs/kaffe.ts`); `shared/ui/` components keep taking props and never import `spool`. Font, icon and dropdown lists open as a popover; every other editor opens in place. Design round 2: three designers push `knobs-open` on numbers and motion, colour type and media, box choices and the section.

### agent, 2026-11-04T00:15:23.620Z

Shipped in spool.page 0.50.0 (task 406): `ui.knobs` with all 24 types, the Knobs rail section, `set-knob` through the write lane, shared knobs, Save as variant, `spool skill knobs`. Design adopted: `app/spool-canvas--knobs`, `app/spool-canvas--knobs-open`, system sheets `dials`, `pickers`, `boxes`; `explore/knobs/` and its Questions row deleted. Known gaps: arrow keys don't walk popover lists or the picture grid; no open/close height animation; a Fast Refresh that deletes every knobs call in a file keeps the old ones until reload; `app/spool-canvas--properties` predates #338 and needs redrawing.
