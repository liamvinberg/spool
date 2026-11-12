---
summary: the loops: shot, logs, url, rehearse, driving a frame, selection, flows
---

shot and logs are two outputs of one boot: the frame's really-served document in spool's own headless Chrome, seeded with --scenario <name> (default when omitted), at frame.json's size (else a narrated 1440×900), in the colour scheme the canvas shows. The first boot on a machine downloads spool's pinned headless Chrome once, narrated on stderr: relay the wait, don't kill it.

  spool shot <frame>… [--viewport <width>x<height>] [--at <ms>[,<ms>…]] [--scroll <px>] [--scenario <name>] [--beat <beat>] [--out <dir>]
                       Name every frame to check in one call, or a page folder for every frame under it: they boot in parallel, the options applying to each. One block per frame, in the order named:
                         shop/checkout: shot, content 3765px tall, no console errors
                           <root>/design/.spool/verify/shop/checkout.1.png  css y 0-1800 of 3765, scale 1.111
                       The head line says the content's own height after fonts load; when the frame was shot at another height it names both (`frame.json h 6400, content 6967`): set frame.json's h from it. It ends with the console error count and any uncaught throws, or reads `does not compile`, `not found` or `failed` with the reason under it. Then each file, each console error as a [type] line, an uncaught throw's stack read back to your .tsx files and lines, and each [spool] line: what renders wrong with a clean console, such as Tailwind classes no stylesheet built (`classes with no CSS: bg-white, text-subtle`, a token reset or renamed), a WebGL context lost, or WebGL drawn in software. The boot runs React's development build, so React's errors come in words.
                       A frame much taller than a screen writes overlapping top-to-bottom slices <frame>.1.png … <frame>.N.png. Read every file: the layout's truth is the whole stack.
                       --viewport sets exact CSS pixels instead of frame.json.
                       --at shoots at each listed time after the first commit (at most 30000 ms) instead of settling, all in one boot, writing <frame>@<ms>.png. Each time is a seek, not a wait: the frame's clocks stand still and are run to it, so the same time is the same picture on any machine. A busy machine makes a seek slower, not a failure: the shot waits as long as the frame keeps answering.
                       --scroll scrolls the document down that many CSS pixels once the frame commits and shoots the viewport there, writing <frame>.scroll<px>.png beside the shot from the top. Use it for below-fold content and scroll-driven effects instead of editing the frame or its h. It scrolls the document, not an element that scrolls inside it.
                       --beat shoots a slide at that beat (topic: deck), by its name or its number counted from 1, writing <frame>.beat-<name>.png.
                       --out copies each file into that folder by its own name and prints that path; frames of one last name need an --out each. Every file is also in design/.spool/verify.
                       A shot is of the source as saved when it comes back: a save while it ran takes it again, and a shot that fails leaves none of its old files behind.
                       Exit 1 if any frame did not compile, was not found, or threw uncaught.
  spool logs <frame> [--scenario <name>]
                       The same boot's full console as [type] lines, uncaught errors and [spool] lines included. shot already prints the errors: reach for logs only for the rest. It is cached by compiled document and scenario name, so after editing a scenario's JSON run shot first, which always boots fresh, then logs.

`spool url <frame>` prints the player URL after checking the frame exists; append &scenario=<name> to pick its seed. `spool url --raw <frame>` prints the bare frame document instead; append ?scenario=<name> there.

The raw document is one frame and nothing else: read its DOM, check its styling, shoot it without chrome in the way. It is sandboxed onto an opaque origin: it has no storage, so a reload starts over, and a walk out of it is a real browser navigation, so the next frame boots from the scenario with the state left behind, and every walk logs a CORS error on the frame document URL that the walk itself ignores, and a walk to a name no frame answers lands on the daemon's 404 text instead of staying put. Drive the player for anything that walks or carries state; reach for the raw document only when the player's chrome is in the way.

To click, type or reach a state before a shot, drive the frame with spool's own Playwright and Chromium: save this as drive.mjs outside design/ (/tmp does) and run `node drive.mjs "$(spool url --raw <frame>)"` (the same command you run spool with). *.spool.localhost needs no host rule, and the anchor is this install's own package, so copy it verbatim.

  import { createRequire } from "node:module";
  const { chromium } = createRequire({{package}})("playwright-core");
  const browser = await chromium.launch({ channel: "chromium-headless-shell" }); // spool's pinned build
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); // at least the frame's size
  await page.goto(process.argv[2], { waitUntil: "domcontentloaded" }); // never networkidle
  await page.locator("#root > *").first().waitFor(); // the frame has rendered
  await page.getByRole("button", { name: "Continue" }).click();
  await page.screenshot({ path: "/tmp/after.png" }); // never into design/
  await browser.close();

Wait for DOMContentLoaded and then a meaningful selector from the frame. Do not wait for networkidle: Spool's live reload connection stays open. On a --raw URL the frame is the page, so use top-level locators. The local player mounts every frame inside a sandboxed `<iframe id="spool-player">`, so its selectors go through `page.frameLocator("#spool-player")`; for a portable website use `page.frameLocator("#website")`. The player's first load after an edit compiles every frame of the project behind a "loading" bar: on a large canvas give that first wait a minute, not Playwright's default 30 s. The played page is never scaled: its viewport width is capped at the frame's authored w, and its height is the window's after the player's chrome, so percentage heights and viewport units answer to that, not frame.json's h. A state you only need to open in is a scenario (topic: scenarios), not a driver.

`spool rehearse <talk>` plays a deck's talk in the stage the room sees, in spool's headless browser, by a presenter's keys from its first beat to its last and back, and says at each slide and beat what broke, moved wrong or lagged (topic: deck), each line opening with the file and line to fix and saying how. It exits 1 only for what breaks the talk: a slide that threw or never became ready, a move that cannot run, a rehearsal that could not finish. It ends with where its pictures are:

  rehearsed talk, 12 slides (19 beats), forward and back in 130 s: 1 broken, 2 notes
  sheet: design/.spool/rehearse/talk/sheet-1.png, sheet-2.png (…); every picture full size in design/.spool/rehearse/talk/stills/

The sheet is every beat at rest in order and every move between slides at its start, middle and end, labelled, edged red where something broke and amber at a note: read every page, as a person would watch the talk. Its folder is made new on every rehearsal; `--out <folder>` copies it where you say. `--slides 4` or `--slides 4-6` rehearses part of the talk, and naming one slide's frame rehearses that slide. A rehearsal takes about ten seconds a slide, more on a busy machine, and narrates on stderr: let it finish. Two rehearse at once on a machine; another waits its turn and says so. A save while it plays is named at the end: rehearse again once you are done saving.

Walks you take in the player flip verified marks on the map's derived edges: `spool flows` shows which a real session confirmed, most valuable on might edges, where a verified one is a branch that actually fired. Reloading the played tab re-reads the scenario, so edit-seed-reload iterates on one URL.

`spool selection` prints what the human points at as one block, the same bytes a spool agent-chat prompt carries, and nothing at all when nothing is selected:

  <selection>
  cart — design/frames/app/cart/frame.tsx — 480×640
  checkout · line-item — design/frames/app/checkout/frame.tsx:44-56
    <li className="flex items-baseline justify-between py-2">…
    3 excerpts elided over budget — read the paths
  </selection>

A frame is its name, its source path and its size. An element is its frame, what the source calls it, and its path with the line range the stamp spans; the line under it is the JSX excerpt, capped at 240 characters. Every entry always contributes that pointer — read the path when you need more — and only excerpts are ever dropped, which the block says out loud when it happens. A runtime-created element takes its name and excerpt from the live DOM and its lines from the nearest stamped ancestor.

`spool flows` prints { frames, edges, unreadable } — every edge { from, to, certainty: "will" | "might", sites: [{ path, line, conditional? }] }, "verified": true once a real session took it, "missing": true on targets no frame answers (typo'd ui.go literals included), and unreadable entries { frame, path, line } for navigation whose destination cannot be read: together, the todo list when wiring a flow.
