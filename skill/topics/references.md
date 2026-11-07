---
summary: pieces of other sites on the references page: reading one for ideas
---

A reference is a piece of another site, or the whole page, the person sent to the canvas with spool's Chrome extension: what they liked about it is the brief, and the site is evidence for it. Each is a frame of its own, frames/references/<site>-<what>/, on the references page, placed where the person was looking. Its frame.tsx says where it came from, when, and what the capture left out.

The frame holds the page as the browser drew it, in a sandboxed document: page.html is its markup and stylesheets with the site's own class names and selectors, its images and fonts copied into assets/ beside it (assets.ts imports them), and frame.tsx renders it at the width of the tab it was taken in, so the site's media queries resolve as they did there. Hover states, transitions, CSS animations and media queries work; nothing the site's scripts did after the capture does, so a canvas, a video or a carousel stands as it was drawn.

Read a reference for its ideas: the layout and its rhythm, the type scale and pairings, the motion (its durations and easings are in page.html's stylesheets, under @keyframes and transition), the colours and how they are used. `spool shot references/<name>` shows it; grep page.html for a class to find the rule behind something. Then design your own frame from what you learned, in the project's own components and tokens. Never copy a reference as it is (its markup, its classes, its copy, its images), never import from one, and never edit one: it is the person's record of what they saw. Delete one only when the person asks.
