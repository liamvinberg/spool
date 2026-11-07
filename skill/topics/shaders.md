---
summary: WebGL, WebGPU, Three.js, shader authoring and verification
---

Shaders run inside an ordinary TSX frame's <canvas>. Put reusable effects in shared/ui/, with props for their inputs, so the component can move into the product. Frame and library imports follow the frames topic.

Choose the interaction from the brief before choosing its inputs: what the person does, what changes in the scene, and what happens when input stops. Ambient effects can run without input. Share rendering setup where useful; each effect keeps the behavior its concept needs. Verify that behavior and its response timing in the live frame. If interaction feels sluggish, measure shader draws per animation callback and input-to-shader delay separately.

Choose the rendering path for the effect:
  - GLSL: shader text passed to browser WebGL or Three.js WebGLRenderer/ShaderMaterial.
  - WebGPU: native shader text is WGSL. Three.js WebGPURenderer uses node materials and TSL, its JavaScript shader expressions, which can target WebGPU or its WebGL 2 fallback. ShaderMaterial is for WebGLRenderer; port custom GLSL to TSL when using WebGPURenderer.
Import .glsl and .wgsl directly as source strings, with no wrapper .ts file. A ?raw suffix is unnecessary but harmless:

  import fragment from "./effect.glsl";
  import compute from "shared/shaders/effect.wgsl";

Editing an imported shader refreshes affected canvas frames. Reload an open player to pick up source edits. spool check types these imports as strings; the browser's graphics API validates the shader language. Spool does not expand shader #include directives. TSL is ordinary imported JavaScript.

Three.js is project-chosen. Merge matching, pinned versions into shared/importmap.json. A tested TSL pair:
  "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.js"
  "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.tsl.js"
Import WebGPURenderer and node materials from "three/webgpu", shader expressions from "three/tsl". For addons that import "three", map it to the same webgpu build. Check the pinned library's documentation for its APIs: https://threejs.org/manual/en/webgpurenderer.html. Spool's offline check does not validate a remote library's API.

Own the lifecycle in a React effect. Await WebGPURenderer.init() before calling render; if initialization completes after unmount, dispose that renderer. Drive rendering with window.requestAnimationFrame and elapsed time from its timestamps: spool gates that loop and clock while freezing frames. Pass the chosen effect's inputs and state through uniforms or buffers as needed. Keep per-tick values outside React state. On cleanup, cancel the loop, disconnect observers/listeners, and dispose the renderer, geometries, materials and textures you created.

Size from the section's container with ResizeObserver, including its drawing buffer and camera/uniforms. Cap device pixel ratio explicitly (1.5 is a useful starting point); the canvas may show several effects together. Respect prefers-reduced-motion with a still render and keep text/buttons usable if graphics initialization fails. WebGPU depends on the browser, adapter and secure context: verify the actual backend; navigator.gpu alone does not prove a usable adapter. For Three.js, exercise forceWebGL: true as well as the preferred WebGPU path.

Verify with spool url, shot and logs: wait for async initialization, inspect rendered pixels, resize, and test reduced motion. A headless browser can choose a different backend from the visible browser: shot and logs say so in a [spool] line when WebGL ran in software (SwiftShader), and when a context was lost, so a black canvas is never a clean boot. shot --at <ms> seeks the frame's clocks, requestAnimationFrame and performance.now included, so an animated shader shoots at the same moment every time, however slowly software GL draws it. Check the canvas's still as well as the live frame and player. An export substitutes an image for each canvas: use a wrapper, classes or inline styles for layout, since a canvas tag selector will no longer match there. Spool preserves WebGL drawing buffers for export. A shader that renders once is enough for a still; animation need not run forever.
