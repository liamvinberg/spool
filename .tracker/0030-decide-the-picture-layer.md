# #30 · Decide the picture layer

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Blocked by: #27
- Created: 2026-10-18T17:43:55.569Z
- Updated: 2026-10-18T17:43:57.895Z
- Closed: 2026-10-18T17:43:57.895Z

A standards decision an agent can make with receipts and teach back (/learn-it), once the picture-layer spike has run in the real canvas. Not a taste call: nothing here changes what the canvas looks like at rest.

## What to decide

- **API.** WebGL2 or WebGPU. Figma moved to WebGPU for compute shaders and explicit state ([blog](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)); Spool draws textured quads, which WebGL2 does in one instanced call. Decide on measured cost and on what the fallback story would be.
- **Tiers and memory.** Which sizes stay resident (1000 frames at 256 px is 175 MB of RGBA, at 128 px 43 MB), how full covers stream in by on-screen size, the budget in GPU memory, and whether GPU-compressed textures (ASTC on Apple silicon, BC elsewhere, via KTX2 and Basis) are worth an encoder in the booth.
- **What moves to the GPU and what stays DOM.** Labels, arrows, walk tags, page objects, selection rings, the hand. Each either draws in GL, rides the DOM overlay's transform, or renders at rest.
- **First paint.** How a 1000-frame page reaches its first complete overview: atlas pages from the daemon, thumbnails per frame, or decoding full covers.
- **Context loss.** What the canvas shows and does when the GL context is lost or never starts.

Blocked by the picture-layer spike.

*From Linear DEV-129.*

Related: #35, #29

Plane: SPOOL-30

## Comments

### agent, 2026-10-18T17:43:57.889Z

**Liam, 2026-10-02:** **Decided by the agent on Liam's delegation (2026-10-03), from #27's measurements in the shipped canvas.**

- **API: WebGL2.** Spool draws textured quads; one instanced WebGL2 draw holds the refresh rate at 1000 frames with 0.3 to 1.5 ms main thread. WebGPU's compute and explicit state buy nothing here, and WebGL2 is in every Chrome and Electron Spool supports. No fallback path.
- **Sizes and memory:** one still per frame (CONTEXT.md: no ladder). On the GPU: a 64 px square per frame in one texture array, and halvings of the still streamed by drawn size, kept within two screens, least recently drawn evicted. GPU-compressed textures are not worth an encoder: the square array is about 22 MB at 1000 frames.
- **What moves to the GPU:** stills only, for frames in `picture` state with a cover. Live and held frames, placeholders, selection, the hand, arrows, page objects and walk tags stay DOM. Labels stay DOM in a screen-space field for now; moving them to the GPU is #35, the one remaining cause of slow frames on a 1000-frame overview zoom.
- **First paint:** per-frame stills fetched and decoded once on two workers, the screen's first; no daemon atlas or small tier needed (n1000 first overview 1.55 s, reload faster than main).
- **Context loss:** stills are re-asked on restore; frames stay hit-testable throughout because hit testing is by world position.
