# #339 · What the engine and the shell could be

- State: closed
- Labels: wayfinder:research
- Parent: #333
- Created: 2026-11-13T14:47:11.018Z
- Updated: 2026-11-13T15:08:48.112Z
- Closed: 2026-11-13T15:08:48.112Z

## Question

What could the new spool be written in and shipped as, and what does each choice make possible or impossible?

Liam: "should we build it in rust". Today: TypeScript throughout, a Node daemon (files, compile with esbuild, sync, the CLI), a React window, Electron for the Mac app, a Cloudflare Worker for the cloud.

From primary sources, for each of these: what it is good at, what it cannot do that spool needs, and who ships a product like this on it. The shell: Electron, Tauri 2 (WKWebView on the Mac: can it isolate frames on another origin, how fast is its canvas and WebGL/WebGPU, what breaks), a native app with embedded web views (WKWebView or CEF) under a GPU-drawn canvas, a browser tab only. The engine: Node, Bun, Deno, Rust, Go, and Rust or Zig compiled to WASM for the parts that run in the window. The compile step: esbuild, SWC, Oxc, Rolldown, Bun's bundler, and what incremental and in-memory builds look like in each. What an agent's CLI costs to start in each (today's `spool` verbs are called many times a minute).

Say which parts of spool each language would really be asked to do, since frames that are web code need a browser engine whatever the rest is written in.

Notes to `~/.brain-archive/spool-foundation/research/engine-and-shell.md`.

## Comments

### agent, 2026-11-13T14:47:31.941Z

Being researched by a worker of task 634 since 2026-11-13; its notes land in ~/.brain-archive/spool-foundation/research/.

### agent, 2026-11-13T15:08:48.112Z

Notes: `~/.brain-archive/spool-foundation/research/engine-and-shell.md`.

**What it found.** Rust cannot replace the browser: as long as frames are web code, WebKit or Chromium lays them out. What Rust (or Go) could own is the CLI, the engine, the compile step and the canvas's own computing. The shell choice is really a choice of browser engine: Electron carries a Chromium version we pick (so HTML-in-Canvas, 120 Hz and one behaviour everywhere); Tauri uses the Mac's WKWebView (smaller app, but its version is the OS's, a 60 Hz limit is reported, and no supported way to hand its pages to a GPU scene was found). A native GPU app that composes browser pages has one concrete route, CEF (Chromium embedded), which exposes shared GPU surfaces on the Mac. A browser tab alone loses the local folder agents write to. The CLI's start cost is the one place language is measured to matter today: a hello-world starts in 1.5 ms in Rust, 2.4 in Go, 7.3 in Bun, 15.6 in Deno, 25.8 in Node (on busy devobee, not spool, not a Mac), and agents call spool's verbs many times a minute. Compile: esbuild is the only one with a documented incremental, in-memory rebuild contract; Rolldown's is experimental, SWC's bundler is being removed, Bun builds in memory but documents no rebuild context. The cloud on Cloudflare stays a separate target whatever the rest is.

**For #345:** the question is not "Rust or not" but which parts: a thin fast CLI, the engine, and a renderer if the drawing spike (#343) picks a design where we draw ourselves. Not established and left to the spikes: WKWebView's real frame rate and sharpness on spool's canvas, per-frame process isolation, the CLI's cost on a Mac.
