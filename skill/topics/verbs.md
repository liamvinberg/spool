---
summary: the loops: shot, logs, url, selection, flows
---

The project verbs — selection, flows, shot, logs, url — resolve the project by walking up from cwd to design/canvas.json or a team project's spool.json and refuse roots they don't know (`spool open` once per machine registers), and auto-start the daemon; `spool status` prints where it listens and warns when a running daemon predates the CLI (`spool stop`, then any verb, updates it) or runs from a checkout since deleted, which every verb warns of too. init and open work offline, except that a team project needs spool.page; skill needs nothing.

shot and logs are two outputs of one boot: the frame's really-served document in spool's own headless Chrome, the same browser that makes the canvas's pictures of frames, seeded with --scenario <name> (default when omitted), viewport from frame.json (else a narrated 1440×900), in the colour scheme the canvas shows (this machine's light or dark setting until a canvas has said). Device scale is picked for legibility: 2× for narrow frames, tapering above 800px wide so the raster stays near what a vision model keeps. Reading a missing or invalid sidecar never creates it.

  spool shot <frame>… [--viewport <width>x<height>] [--at <ms>[,<ms>…]] [--scroll <px>] [--scenario <name>]
                       Name every frame to check in one call, or a page folder for every frame under it: they boot in parallel in the same browser, the options applying to each. One block per frame on stdout, in the order named:
                         shop/checkout: shot, content 3765px tall, no console errors
                           <root>/design/.spool/verify/shop/checkout.1.png  css y 0-1800 of 3765, scale 1.111
                       The head line says the content's own height after fonts load; when the frame was shot at another height it names both (`frame.json h 6400, content 6967`): set frame.json's h from it. It ends with the console error count and any uncaught throws, or reads `does not compile`, `not found` or `failed` with the reason indented under it. Then each file with the CSS pixels it holds and the PNG pixels per CSS pixel, then each console error as a [type] line, an uncaught throw's stack read back to your .tsx files and lines, then each [spool] line: what renders wrong with a clean console, Tailwind classes no stylesheet built (`classes with no CSS: bg-white, text-subtle` — a token reset or renamed), a WebGL context lost, WebGL drawn in software (SwiftShader). The boot runs React's development build, so React's errors and warnings come in words.
                       Files mirror the frame's path under design/.spool/verify. A frame much taller than a screen writes top-to-bottom slices <frame>.1.png … <frame>.N.png that overlap a little, the last anchored to the bottom: each line's y range says where it sits. Read every file — the layout's truth is the whole stack.
                       --viewport sets exact positive-integer CSS pixels instead of frame.json.
                       --at shoots at each listed time after the first commit (at most 30000 ms) instead of settling, all in one boot, writing <frame>@<ms>.png; a shot at other times never overwrites it. Each time is a seek, not a wait: the frame's clocks (Date, performance.now, timers, requestAnimationFrame, CSS and Web Animations) stand still and are run to it, so the same time is the same picture on any machine.
                       --scroll scrolls the document down that many CSS pixels once the frame commits, at once even under smooth scroll-behavior, then settles (or seeks, with --at) and shoots the viewport there, writing <frame>.scroll<px>.png (<frame>.scroll<px>@<ms>.png with --at); the shot from the top stays. Use it for below-fold content and scroll-driven effects of a frame shot at its screen height, instead of editing the frame or its frame.json h. A document that runs out first stops at its end and a [spool] line says where. It scrolls the document, not an element that scrolls inside it.
                       Without --at, waits for #root to have children (up to 10s), then settles the way the canvas's picture of the frame does (fonts, finite entry animations, a quiet DOM, up to 900ms), waits for document.fonts.ready, then shoots; a frame that renders nothing still shoots.
                       Exit 1 if any frame did not compile, was not found, or threw uncaught; the last line on stderr names which.
  spool logs <frame> [--scenario <name>]
                       Prints the same scenario boot's full console as [type] text lines, uncaught errors and [spool] lines included. shot already prints the errors: reach for logs only for the rest.
                       The cache identity is compiled document plus scenario name. Code and stylesheet edits re-boot; a scenario JSON edit under the same name does not. A shot always boots fresh and refreshes that scenario's cache, so after editing data run shot first, then logs.
                       Scenario failures are console errors, so shot prints them too.

The first browser boot on a machine downloads spool's pinned headless Chrome once, narrated on stderr — relay the wait, don't kill it.

The drive loop — `spool url <frame>` prints the player URL after checking the frame exists. Append &scenario=<name> to pick its seed. `spool url --raw <frame>` prints the stable bare frame document instead; append ?scenario=<name> there.

The raw document is one frame and nothing else: read its DOM, check its styling, shoot it without chrome in the way. It is sandboxed onto an opaque origin, and that costs it every session guarantee the canvas and the player keep. It has no storage, so a reload starts over. A walk out of it is a real browser navigation, so the next frame boots from the scenario with the state left behind. Its target probe cannot read a cross-origin answer, so every walk logs a CORS error on the frame document URL that the walk itself ignores, and a walk to a name no frame answers lands on the daemon's 404 text instead of staying put. Drive the player for anything that walks or carries state; reach for the raw document only when the player's chrome is what's in the way.

For Playwright, wait for DOMContentLoaded and then a meaningful selector from the frame. Do not wait for networkidle: Spool's live reload connection stays open. The local player mounts every frame inside a sandboxed `<iframe id="spool-player">`, so its selectors go through `page.frameLocator("#spool-player")`. Its first load after an edit compiles every frame of the project behind a "loading" bar, the iframe there but empty: on a large canvas give that first wait a minute, not Playwright's default 30 s. For a portable website use `page.frameLocator("#website")`. On a --raw URL the frame is the page, so use top-level locators. The played page is never scaled: its viewport width is capped at the frame's authored w, while its viewport height is the window's available height after local player chrome. Content scrolls within that viewport. Percentage heights and viewport units therefore answer to the actual inner viewport, not frame.json's h. Compare surfaces at equal inner dimensions after fonts and images settle. To use the dependency belonging to this exact Spool install from a repo script, copy the installed-package anchor printed below verbatim:

  import { createRequire } from "node:module";
  const requireFromSpool = createRequire({{package}});
  const { chromium } = requireFromSpool("playwright-core");

  const browser = await chromium.launch({ channel: "chromium-headless-shell" }); // spool's pinned build
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); // at least the frame's size
  await page.goto(playerUrl, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator("#spool-player"); // on a --raw URL, use page itself
  await frame.locator("[data-ready='true']").waitFor(); // use a meaningful selector

Walks you take in the player flip verified marks on the map's derived edges — `spool flows` shows which claims a real session has confirmed, most valuable on might edges: a verified faint edge is a branch that actually fired. Reloading the played tab re-reads the scenario, so edit-seed-reload iterates on one URL.

`spool selection` prints what the human points at as one block — the same bytes a spool agent-chat prompt carries, and nothing at all when nothing is selected:

  <selection>
  cart — design/frames/app/cart/frame.tsx — 480×640
  checkout · line-item — design/frames/app/checkout/frame.tsx:44-56
    <li className="flex items-baseline justify-between py-2">…
    3 excerpts elided over budget — read the paths
  </selection>

A frame is its name, its source path and its size. An element is its frame, what the source calls it, and its path with the line range the stamp spans; the line under it is the JSX excerpt, capped at 240 characters. Every entry always contributes that pointer — read the path when you need more — and only excerpts are ever dropped, which the block says out loud when it happens. A runtime-created element takes its name and excerpt from the live DOM and its lines from the nearest stamped ancestor.

`spool flows` prints { frames, edges, unreadable } — every edge { from, to, certainty: "will" | "might", sites: [{ path, line, conditional? }] }, "verified": true once a real session took it, "missing": true on targets no frame answers (typo'd ui.go literals included), and unreadable entries { frame, path, line } for navigation whose destination cannot be read: together, the todo list when wiring a flow.
