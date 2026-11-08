---
summary: ui.knobs: values a person tunes by hand, their types, shared knobs
experiment: knobs
---

Knobs are the values on a frame a person tunes by hand: they show in the canvas's properties rail under the frame's geometry, move the running frame live while a person drags, and write the literal back into the file on release. Declare them for the 3 to 8 values on a frame that need taste (a radius, an easing, an accent), never for every style, and never for prototype data, which is ui.state (topic: flows). A frame without knobs is unchanged.

  import { ui } from "spool";
  const k = ui.knobs({
    card: {
      radius: { type: "corners", value: 20, min: 0, max: 40 },
      accent: { type: "color", value: "#c8553d", swatches: ["#c8553d", "#2f6f5e"] },
    },
    motion: {
      ease: { type: "easing", value: [0.2, 0, 0, 1] },
      replay: { type: "action", label: "Replay entrance" },
    },
  });
  <section key={k.motion.replay} style={{ borderRadius: k.card.radius, background: k.card.accent }}>

Each knob is a type, a literal value, and what its control needs; a nested object is a group that folds in the rail, in code order. The types, each with its value and options:
  slider, stepper            a number; min, max, step, unit
  range                      [low, high]; min, max, step, unit
  angle                      a number of degrees
  xy                         { x, y }; min, max, step, unit
  duration                   seconds; min, max
  easing                     cubic-bezier [x1, y1, x2, y2]
  spring                     { duration, bounce } (seconds, -1…1) or { stiffness, damping, mass? }
  color                      any CSS colour; alpha, swatches to try on
  gradient                   a CSS linear-gradient()
  toggle                     a boolean
  segmented, select, pictures, icon   one option's value; options as strings or { value, label?, image? }
  image                      options as { value, image } (an imported image's URL); reads as the chosen option's image
  text, longtext             a string
  font                       a family; options, else the families the document loaded
  weight                     a number; options, else the family's weights
  spacing                    px: a number, [vertical, horizontal] or [top, right, bottom, left]; min, max
  corners                    px: a number or [top-left, top-right, bottom-right, bottom-left]; min, max
  shadow                     a CSS box-shadow
  action                     label; no value, nothing written: reads as how many times it was pressed, so a key on what it replays

Read a value as k.card.radius: while a person drags, the frame re-renders with the new value, without a recompile. Call ui.knobs once, at module level. Every value is a literal in the call (a number, a string, an array or object of them): a computed one shows read-only and can't be tuned. Knobs more than one frame reads live in a shared file outside shared/ui/, shared/knobs/kaffe.ts exporting the call (export const kaffe = ui.knobs({…})) and each frame importing it: one value for every frame. shared/ui/ components still take props and never import "spool"; the frame passes them the value.

A person's tune writes its literal into the file, so read the file again before editing it, and when you rewrite a frame keep the values a person tuned. Knobs show only to editors on the canvas, never in the player or a share, and no scenario or play session resets them.
