---
"spool.page": minor
---

Spool now reads your project's own theme, and the canvas asks it rather than assuming Tailwind's defaults. It compiles your `tokens.css` the same way it compiles your frames, so it knows your colours, your type scale, your radii and your breakpoints by the names you gave them. The first place you see it is the properties rail: the scopes it offers you to edit under are your breakpoints, not the ones you renamed away.

The same reading fixed a real bug in editing. If your type scale has a name Tailwind does not use, like `text-md`, writing a size to an element used to take the element's colour away, because the class looked like a colour to spool. It does not any more: a size is a size and a colour is a colour, by your theme's own naming. Editing a colour on a border edge, a caret, a shadow or a divider now replaces what was there instead of stacking a second class beside it, and `top`, `right`, `bottom` and `left` collapse into `inset` the way padding always has.
