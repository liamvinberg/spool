# #225 · Photo booth on the GPU on Linux and Windows, and no pace timing in software

- State: closed (done)
- Labels: ready-for-agent, enhancement
- Created: 2026-11-06T17:06:13.153Z
- Updated: 2026-11-06T18:42:29.579Z
- Closed: 2026-11-06T18:42:29.579Z

The photo booth's headless shell draws on the GPU only on macOS (`headlessShellArgs` in `src/headless-shell.ts`: `--enable-gpu --use-angle=metal --ignore-gpu-blocklist`). On Linux and Windows Chrome's defaults stand, which is SwiftShader: WebGL and raster on the CPU.

Seen on devobee (agent-hub task 458, 2026-11-06): with 5 designer workers on one canvas, the booth's GPU process alone sat at about 2.7 cores for minutes.

The pace timing makes it worse. After every edit the booth times the frame's redraws at `PACE_SCALE` 2 (`PACE_PIXELS` 1920x1200x4). In software that is heavy, and its verdict is wrong for the machine people view on: a frame that keeps up on a real GPU is recorded below `SLOW_PER_SECOND` and `spool check` calls it slow, so agents may "fix" frames that are fine.

## What to do
1. Linux: try a GPU backend (ANGLE on Vulkan, or GL/EGL) when a render node is usable (`/dev/dri/renderD*`). Fall back to today's flags when the launch fails or WebGL still reports a software renderer. devobee has an Intel Core Ultra 9 iGPU and `liam` can open `/dev/dri/renderD128`. Prove the covers match the software ones (backdrop-filter, WebGL fields: the reasons the Mac flags exist).
2. Windows: the same with ANGLE's D3D11 backend, ready for the Windows port. Measure it on a Windows machine when there is one; ai-server-2 boots Windows.
3. Pace: when the booth's renderer is software, skip the timing or record it as untrustworthy, so `check` never reports a software timing as slow.
4. An opt-out (env or config) that forces software.

Measure booth CPU and a covers-from-nothing pass (`bench/reload.ts`'s `covers_from_nothing_s`) before and after on devobee.

## Comments

### agent, 2026-11-06T18:42:29.579Z

Shipped in fc1da2a9 (main).

**What changed**
- The booth's shell tries the GPU first: Metal on a Mac, D3D11 on Windows, on Linux GLES over EGL with one usable render node and Vulkan with several. After launch it reads `SystemInfo.getInfo`; when compositing or WebGL is software, or the GL is SwiftShader/llvmpipe/basic render, or the GPU launch fails, it relaunches on Chrome's defaults. The recorder keeps its old flags (Mac GPU only).
- A booth drawing in software times nothing and forgets the frame's old pace, so `check` never reports a software timing.
- `SPOOL_BOOTH_GPU=0` forces software.

**Measured on devobee** (Intel Arc iGPU, machine at load 25 to 40 from other agents, base = main, interleaved)
- Covers from nothing, n200, 4 rounds each: 53.3 s to 50.5 s median (worst 62.1 to 51.7). Booth chrome CPU over the whole run (warm pass of 1449 frames + 4 rounds): 1452 to 996 CPU-s (-31%); GPU process 465 to 276 CPU-s (-40%).
- 25 frames edited at once (n025), 4 rounds each: covers and paces done in about 31.6 s to 13.2 s; booth chrome 48 to 17 CPU-s per pass (-65%). Paces: software marked 18 of 25 frames slow (median 28/s); GPU timed all 25 at 60/s.
- Backend choice: a 300-gradient 2D canvas at 1920x1200@2x drew under 1 fps in SwiftShader, 50 to 60 on GLES/EGL, 8 to 16 on Vulkan.

**ai-server-2** (Linux, 7900 XTX + Ryzen iGPU): GLES/EGL picks the iGPU whatever the flags (9 fps); Vulkan takes the 7900 XTX (60 fps), hence Vulkan with several render nodes. There SwiftShader drew no WebGL field at all in the cover test page; both GPU paths drew it. On devobee all three agreed within 9/255 per channel.

**Not measured:** Windows (ai-server-2 was in Ubuntu); the D3D11 path has the same fallback.

Note: broken-frame-browser.test.ts flakes about 1 in 5 under load on main too (waiting 60 s for the first cover), unrelated to this.
