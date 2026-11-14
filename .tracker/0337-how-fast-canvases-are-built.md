# #337 · How fast canvases are built

- State: closed
- Labels: wayfinder:research
- Parent: #333
- Created: 2026-11-13T14:47:10.999Z
- Updated: 2026-11-13T15:00:31.130Z
- Closed: 2026-11-13T15:00:31.130Z

## Question

How do the fastest canvas tools draw thousands of objects and stay smooth, and what do the ones that show live web content on a canvas do about it?

Primary sources only (engineering posts, talks, source code): Figma (its renderer, WebGL to WebGPU, its C++ and WASM core, tiles, how text is drawn), tldraw, Excalidraw, Miro, Framer's canvas, Penpot's new renderer, Rive, Zed's GPUI, and anything that puts live iframes or webviews on a zoomable canvas (Framer, Webflow, Onlook, Paper, Pencil, Subframe, v0's canvas if it has one). For each: what is drawn by the GPU and what by the browser's own layout, how level of detail and culling work, how a live thing is swapped for a picture and back, what they measured, and what they regret.

Today's spool for comparison: every frame's picture is drawn by one WebGL2 canvas behind the DOM, and live documents are iframes over it (`src/ui/canvas/picture-layer.ts`, ADR 0010).

End with the three or four drawing designs worth a spike for spool, each with what it would cost and what it could gain.

Notes to `~/.brain-archive/spool-foundation/research/fast-canvases.md`.

## Comments

### agent, 2026-11-13T14:47:31.790Z

Being researched by a worker of task 634 since 2026-11-13; its notes land in ~/.brain-archive/spool-foundation/research/.

### agent, 2026-11-13T15:00:31.130Z

Notes: `~/.brain-archive/spool-foundation/research/fast-canvases.md`.

**What it found.** Fast vector tools (Figma, Penpot, Rive, GPUI) are fast because they draw their own shapes; none of that draws a web document, so as long as a frame is web code a browser engine lays it out. The tools that do put web content on a canvas (tldraw, Excalidraw, Onlook, Framer) keep it in the DOM and cull or hide it; only Framer documents swapping live things for pictures (five live shader components at once, the rest first-frame images). Nobody has published a benchmark of thousands of live web documents on one canvas. WebGPU alone is not a speedup (Figma's own account). New since spool's canvas was designed: HTML-in-Canvas is stable in Chrome 157 (checked on Chrome's blog, 2026-11-13): the browser lays out HTML and hands it to WebGL or WebGPU as a texture, still interactive; cross-origin pixels stay restricted, which matters for frames on another origin.

**The four designs worth a spike (#343):**
1. GPU pictures plus a bounded number of live DOM documents (today's design, done again cleanly). The line to beat.
2. DOM only, culled hard. The cheap baseline: tldraw's way.
3. HTML-in-Canvas: the browser lays out, one GPU scene draws everything, so picture and live are the same pixels. The one that could make "identical, then live on zoom" true by construction. Open: frames on another origin, the Chrome version inside the app.
4. A native GPU compositor that takes browser surfaces as textures (the Rust/GPUI shape). Highest cost; Electron's shared-texture offscreen rendering allows a first experiment without rewriting the app.
