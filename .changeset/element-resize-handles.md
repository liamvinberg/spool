---
"spool.page": minor
---

Resize an element by its handles, without interrupting the layout it lives in. A selected element wears four corners and four edge targets — a short side keeps its corners and drops its strip, and a target too small to aim at draws none — and dragging one reflows every use of that source while the pointer is down. Hold Shift to keep the proportions it started with, or Option to grow an already free-positioned element from its centre; an element the layout places keeps its place. Letting go saves once and leaves one Undo entry. Escape, a lost pointer, a window that loses focus and a scrolled or zoomed canvas all put the previews back and save nothing, and a result the layout constrained says so instead of claiming the size it asked for. Rotation now saves the same way, and the old element-write route is gone.
