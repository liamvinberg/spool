---
"spool.page": patch
---

Frames that import a shader with `?raw`, like `import fragment from "./effect.glsl?raw"`, can now be shared. They rendered on the canvas but sharing refused them, and the shader was missing from the export. Editing such a shader now also refreshes the frame on the canvas.
