import { fileURLToPath } from "node:url";
import { SpoolError } from "./errors";

/**
 * The in-package skill (#25 shipped the verb, #26 these words): `spool skill
 * [topic]` prints it — nothing installs per harness, every install carries its
 * own teacher. The overview opens with the completeness contract and both
 * fixed laws verbatim; topics hold the depth. Every claim here describes
 * shipped behavior — when the runtime changes, this text changes in the same
 * commit.
 */

const spoolPackageJson = fileURLToPath(new URL("../package.json", import.meta.url));

const overview = `spool — the live prototyping canvas. Html frames are TSX components in design/ on disk; the canvas is a projection the human arranges and plays. You author files; spool renders, links, and verifies them.

This skill is the complete contract: if it isn't here, spool doesn't do it.

The one law: never write app-owned files — design/canvas.json and design/.spool/ are spool's. Everything else under design/ is yours to author, rename, and delete. No locks: parallel agents stay safe by writing frame folders, never shared registries.

A frame is born by writing design/frames/<name>/frame.tsx default-exporting one React component — no registration, no \`spool new\`. It appears on the canvas live. Variants are \`--\`-named sibling folders (checkout--empty). spool owns the document: pinned React, Tailwind compiled at serve, preflight, tokens, fonts, the mock and flow runtime are all injected — write only the component. Frames render nowhere outside spool.

There are exactly two frame kinds, told apart by the entry filename: frame.tsx is an html frame; term.tsx remains recognized as a terminal frame, but spool renders a static disabled surface and does not execute its source until project code can run inside an OS sandbox (topic: terminals). A folder holding both entries is an error naming the folder; pick one.

Lifecycle (offline, take a path):
  spool init [path]     scaffold design/ in a product root and register it
  spool open [path]     register an existing project by walk-up

Read verbs (work from any cwd inside a registered project, auto-start the daemon):
  spool selection       what the human points at: frame or element, source path and lines
  spool flows           the link graph, read from source: edges, certainty, verified walks
  spool shot <frame>    boot headless; viewport, time, and scenario are selectable
  spool logs <frame>    the same scenario boot's console, cached by compiled source
  spool url <frame>     mint a player URL; --raw mints the bare frame document
  spool skill [topic]   this text (needs nothing)

The daemon: \`spool serve\` / \`spool status\` / \`spool stop\` are the handles; \`spool autostart\` makes it start at login (macOS); \`spool upgrade\` installs the latest release and restarts it. The CLI boots your frame in spool's own headless Chrome — it never reads the human's canvas.

Topics — \`spool skill <topic>\`:
  frames      the design/ contract: folders, sidecars, shared/, libraries
  terminals   term.tsx: recognized, but static and disabled until OS-sandboxed
  flows       data-go, ui.go/back/state/use, sessions, arrows
  scenarios   named seeds: { state, mock }
  mock        the fake backend behind relative fetch
  styling     Tailwind, tokens.css, cn(), motion
  verbs       the loops: shot, logs, url, selection, flows`;

const topics: Record<string, string> = {
	frames: `Everything lives under design/:

  frames/<name>/frame.tsx    default-exports one React component: the frame
  frames/<name>/frame.json   geometry sidecar { x, y, w, h } (integers, px)
  frames/<name>/*            anything else the frame imports relatively
  frames/<page>/<name>/      a page: one level of grouping, its own canvas (below)
  shared/ui/                 shared components: kebab-case files, no barrels
  shared/lib/utils.ts        cn() — clsx + tailwind-merge
  shared/tokens.css          the single token file (topic: styling)
  shared/transitions.css     player transition styling, plain CSS (topic: flows)
  shared/fonts.css           @import / @font-face, injected into every document
  shared/importmap.json      URL imports for libraries (below)
  shared/scenarios/*.json    named seeds (topic: scenarios)
  shared/fixtures/*.json     the mock's data (topic: mock)
  shared/assets/             yours to organize — but project files are not served in v1 (below)
  AGENTS.md, CLAUDE.md       init's signposts pointing here; .gitignore covers .spool/
  canvas.json, .spool/       app-owned — never write these

Names are folder names — no leading dot, no slashes. Variants are \`--\`-suffixed siblings (checkout--empty), complete frames in their own right and valid walk targets. Renaming a frame is renaming its folder: update data-go and ui.go literals that target it, or the map marks them missing. Deleting is deleting the folder.

Pages group frames into journeys: a folder under frames/ without a frame entry (frame.tsx or term.tsx) is a page, its subfolders are frames of either kind, and there is no deeper nesting. Each page is its own canvas; the flat top level is the permanent root page. Start flat — introduce pages when the project grows and flows cluster into distinct journeys. Frame names stay identity project-wide: unique across every page (two claimants is a loud error naming both), so walk targets, URLs, thumbnails, and geometry all survive moves. Create a page by creating its folder; move a frame by moving its folder — and re-aim its relative imports (shared/ sits one level further up from inside a page). The canvas reflects either kind immediately. Walks cross pages freely: the player ignores pages entirely, and the canvas draws a portal marker where an arrow cannot reach.

frame.json is the one file both hands write, geometry only: the canvas projection fills it in when missing (390×844, placed beside its own page's frames) and rewrites it as the human drags and resizes; its first fill is create-only, so a sidecar you authored first wins. shot and logs only read geometry and never create this file. Write w/h yourself for an exact size. Beyond that, spool's hands touch your files exactly one more way — the human's delete moves a frame folder to the OS Trash. Source is never edited from the canvas.

The component: a React function component, hooks and all, rendered into #root of a document spool assembles — finished CSS, tokens, fonts.css, the import map, and the runtime are injected; html, body, and #root have height: 100%, so h-full reaches the frame edge. Nested flex-fill chains need a definite h-full at each link; min-h-full does not give flex-1 a definite height. Frames are blank until React commits; the canvas covers boots with thumbnails. State split: useState is what a widget feels, ui.state is what the app knows (topic: flows).

shared/ui components take props, never knowledge — importing "spool" there fails the compile. Flow and app state live in frames; a shared component receives values and callbacks. That boundary is what keeps shared/ui able to move into a product unchanged.

Libraries: design/ never gets a package.json and nothing is npm-installed there. Imports resolve through shared/importmap.json to URLs (esm.sh works well); init pins clsx, tailwind-merge, class-variance-authority, and motion. A React-based library must not bundle its own React (esm.sh: ?external=react,react-dom) — spool pins react, react-dom, react-dom/client, react/jsx-runtime, and "spool" itself, and its pins always win, so exactly one React runs. Plain .css imports from any source file land in the document as-is.

Static assets: project files are not served in v1 — reference images and media by absolute URL or data URI; fonts via hosted @import or absolute/data src in fonts.css. A relative <img src> has nothing to answer it.`,

	terminals: `A terminal frame is born by writing design/frames/<name>/term.tsx. Spool still recognizes the entry as the terminal frame kind, gives it whole-cell geometry, and includes it on the canvas and in the player.

Terminal execution is disabled until project code can run inside an OS sandbox. The daemon does not compile, evaluate, or execute term.tsx, and it never starts Bun, OpenTUI, a shell, a PTY, or any other process for the entry. Spool renders its own static disabled surface instead; that surface contains no project code and carries no capability to control the daemon. Saving, entering, reloading, or restarting the frame cannot spawn a process.

New terminal frames keep their 80×24 geometry floor: one cell is 9×20px in the pinned mono, so 80×24 = 720×480. frame.json remains pixels, the canvas's one geometry language. Geometry and any already persisted grid can still be represented in whole cells, but there is no live process to resize or repaint it.

The flow parser still recognizes the terminal dialect's coded walk in source:

  import { term } from "spool/term";
  term.go("checkout")

The map reads term.go literals like every other navigation site: solid when unconditional, faint inside a branch, and unreadable destinations named by \`spool flows\`, never guessed. Because term.tsx does not run, the disabled surface cannot trigger or verify one of these edges.

There is currently no terminal input, output, process lifecycle, restart, or shared live session. The platform modifier + Escape still leaves an entered terminal surface; no other key reaches project code.

Headless verification never boots terminal project code. \`spool shot <name>\` can only rasterize an already persisted grid; a terminal without one has no screen to shoot. \`spool logs\` remains an html-frame verb.`,

	flows: `Navigation is walking: a session stands in one frame and walks to another by name.

data-go="<frame-name>" on any element walks there on click — nearest data-go ancestor wins, anchors get preventDefault, variants are valid targets. data-transition="<type>" on the same element names the move for transition styling (felt in the player). That is all the markup sugar; everything richer is code:

  import { ui } from "spool";
  ui.go(name, patch?)   merge patch into ui.state, push this frame onto the stack, walk
  ui.back()             pop the stack and walk back; empty stack is a quiet no-op
  ui.state              the session's flat shared state: a plain mutable object, any write re-renders subscribers
  ui.use()              hook — subscribe the calling component to ui.state changes

For a shared html component, keep the literal ui.go("target") call or data-go navigation in the frame-owned file and pass a callback or prop into shared UI. Spool does not traverse imports to guess a flow claim.

Coded walks carry no transition name — data-transition rides the element, ui.go has no third argument. Walking to a frame that doesn't exist logs an error and stays put; a typo never eats the session. ui.state is schemaless and shared by every frame in the session: initialize defensively (ui.state.items ??= [...]) because any frame can be a session's first. Top-level keys are the unit of reasoning; nested writes still react.

The session seeds from a scenario before first render — a frame never renders unseeded (topic: scenarios). A frame document keeps its session across walks and reloads in that browser tab; ?scenario=<name> on its URL names the seed, and a name different from the running session's restarts it. On the canvas, a walk hands the session to the next frame. In the player every load is a fresh session — reload is restart.

Arrows claim what the code says. Every literal data-go target, ui.go(name) call, and term.go(name) call anywhere in a frame's folder is an edge, drawn from the element that causes it: solid when the walk is unconditional (will go), faint when the literal sits inside a branch — ternary, if/else, switch, &&/|| (might go; ui.go(ok ? "receipt" : "topup") draws two faint arrows). Terminal term.go sites remain visible in this static analysis while execution is disabled, but their surface cannot take or verify the walk (topic: terminals). A destination the parser cannot read (ui.go(routeFor(state))) draws nothing and is reported by \`spool flows\` as unreadable — prefer literal targets when you want the map to show the flow. Playing never adds or removes an arrow; real walks only flip verified marks on derived edges, dropped when the from-frame's source changes. A headless shot/logs boot never verifies anything.

The player composes every html frame into one document, so walks are View Transitions, not navigations: crossfade by default; morphs happen wherever two frames give an element the same view-transition-name. Each swap carries its direction (forward, back, restart) plus any data-transition type — style them in shared/transitions.css with ::view-transition-* selectors, plain CSS. Reduced motion is respected, and the player pill toggles motion, walks back, restarts, and closes. Screen components mount fresh on every arrival. Terminal frames remain valid destinations, but the player renders their static disabled surface without executing or restarting project code (topic: terminals).`,

	scenarios: `shared/scenarios/<name>.json = { "state": { ... }, "mock": { ... } } — one named way the app can be. state seeds ui.state at session start; mock configures the fake backend (topic: mock). Both keys optional; no default.json means an empty seed. Names are file names: no leading dot, no slashes.

default.json is what loads when nothing else is named or resumed: canvas plays, shot/logs boots. The player URL takes ?scenario=<name>; a frame document's URL takes the same query, and naming a different scenario restarts the session. The player's restart button re-reads the file, so an edited seed lands without a new URL.

Frames never branch on which scenario is loaded — no scenario name in ui.state, no "if demo". A scenario is felt through what it seeds: loading is mock latency, empty is an empty fixture or state, failure is a mock status rule. If a frame needs a flag, that flag is state.

A scenario file that is missing or broken never blanks the frame: it plays with an empty seed and the error lands in the frame's console — \`spool logs\` shows it.`,

	mock: `Inside a session, relative URLs are the fake backend and absolute URLs are the real network. The boundary is the URL string, and only fetch is intercepted — no XHR, no WebSocket.

Zero config: fetch("/api/<name>") answers with shared/fixtures/<name>.json — nested names allowed (/api/users/1 → fixtures/users/1.json), a .json suffix tolerated. Any method gets the same answer: writes are theater, persistence is your frame updating ui.state after the "request" succeeds.

A scenario's mock object refines any relative route (keys match the path; query strings are ignored):

  "mock": {
    "latency": 400,                             // ms, applied to every mocked route
    "GET /api/orders": { "fixture": "orders-empty" },
    "/api/orders": { "status": 500 },           // method-prefixed key wins over the bare path
    "/api/me": { "body": { "plan": "pro" } },   // inline answer, status 200 unless given
    "/api/slow": { "latency": 2000 },           // timing only — body still resolves by convention
    "/api/flags": ["a", "b"]                    // any non-rule value is served verbatim as the body
  }

Rule keys are exactly status, fixture (a fixtures/ name), latency (ms), and body (inline JSON); an object made only of those is a rule, anything else is the response itself. status alone answers an empty body. An unmatched relative fetch 404s with a message naming the fix; a malformed fixture fails loud with its path.

There is no programmable mock — behavior richer than rules belongs in the frame: optimistic ui.state updates over theater requests is the idiom.`,

	styling: `Tailwind v4, compiled at serve: write utility classes in JSX and the document arrives with finished CSS — theme, preflight, exactly the utilities your source uses. No config file, no directives, no build step of yours; the compiler is spool's, pinned per format version, arbitrary values and variants all working.

Tailwind v4 puts important at the end: mt-3.5!, not !mt-3.5.

Classes first, real CSS when classes can't say it: a <style> element in the frame for one-offs, or a plain .css import. transitions.css and fonts.css stay plain CSS.

Compose classes with cn() from shared/lib/utils.ts — cn() only, never template-literal class strings. Variant components ride cva (pinned).

Tokens live in shared/tokens.css, the single token file and the only stylesheet the Tailwind compile reads (plus its relative @imports; @plugin and @config are not supported):
  - distilled from a product: paste its variables into :root verbatim, names kept
  - born in spool: declare under @theme, and utilities pick them up (--color-surface → bg-surface)
  - bridging: @theme inline aliases existing :root variables into utility names
One file, both blocks — shadcn v4's shape. Non-Tailwind consumers can import the same file; browsers skip @theme.

Fonts: shared/fonts.css is injected into every document — @import url(...) for hosted fonts, or @font-face with absolute/data src (local font files are not served in v1).

Motion is for interaction feel — the motion library is pinned (import { motion } from "motion/react"): hover, press, drag, springs, layout animation inside a frame. Screen-to-screen motion is never animated from a frame; it belongs to the flow layer (topic: flows). Other animation libraries: add them to the import map.

The document's baseline: preflight (the same zero a product starts from), tokens, fonts, height chain at 100%. Frames add nothing global — no resets, no font stacks in components; identity lives in tokens.`,

	verbs: `The project verbs — selection, flows, shot, logs, url — resolve the project by walking up from cwd to design/canvas.json and refuse roots they don't know (\`spool open\` once per machine registers), and auto-start the daemon; \`spool status\` prints where it listens and warns when a running daemon predates the CLI (\`spool stop\`, then any verb, updates it). init and open work offline; skill needs nothing.

The verify loop — shot and logs are two outputs of one boot: your frame's really-served document in spool's own headless Chrome, seeded with --scenario <name> (default when omitted), viewport from frame.json (else a narrated 390×844) at 2×. Reading a missing or invalid sidecar never creates it.

  spool shot <frame> [--viewport <width>x<height>] [--at <milliseconds>] [--scenario <name>]
                       writes design/.spool/verify/<frame>.png, prints the path.
                       --viewport sets exact positive-integer CSS pixels instead of frame.json.
                       --at sets the post-commit settle wait; the default is 300ms.
                       A terminal never executes for a shot; an already persisted grid can rasterize to <frame>.svg, otherwise there is no screen (topic: terminals).
                       Doesn't compile: the toolchain's error verbatim on stderr, exit 1, no browser.
                       Throws uncaught while booting: shot still written, errors on stderr, exit 1.
                       Waits for #root to have children (up to 10s), settles, shoots — a frame that renders nothing still shoots.
  spool logs <frame> [--scenario <name>]
                       prints the same scenario boot's console as [type] text lines, uncaught errors included.
                       The cache identity is compiled document plus scenario name. Code and stylesheet edits re-boot; a scenario or fixture JSON edit under the same name does not. shot always boots fresh and refreshes that scenario's cache, so after editing data run shot first, then logs.
                       A replay says "cache matches current compiled source": it is the fresh boot that shot recorded, not evidence that a source edit was ignored.
                       Scenario failures and mock 404s land here; read shot and logs together.

The first shot on a machine downloads spool's pinned headless Chrome once, narrated on stderr — relay the wait, don't kill it.

The drive loop — \`spool url <frame>\` prints the player URL after checking the frame exists. Append &scenario=<name> to pick its seed. \`spool url --raw <frame>\` prints the stable bare frame document instead; append ?scenario=<name> there. Drive the player for walks, or the raw document when its chrome would get in the way.

For Playwright, wait for DOMContentLoaded and then a meaningful selector from the frame. Do not wait for networkidle: Spool's live reload connection stays open. To use the dependency belonging to this exact Spool install from a repo script, copy the installed-package anchor printed below verbatim:

  import { createRequire } from "node:module";
  const requireFromSpool = createRequire(${JSON.stringify(spoolPackageJson)});
  const { chromium } = requireFromSpool("playwright-core");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(rawUrl, { waitUntil: "domcontentloaded" });
  await page.locator("[data-ready='true']").waitFor(); // use a meaningful selector

Walks you take in the player flip verified marks on the map's derived edges — \`spool flows\` shows which claims a real session has confirmed, most valuable on might edges: a verified faint edge is a branch that actually fired. The player's restart re-reads the scenario, so edit-seed-restart iterates on one URL.

\`spool selection\` prints what the human points at — always a JSON list, empty when nothing is selected:
  frame entries      { kind: "frame", frame, path, size: { w, h } }
  element entries    { kind: "element", frame, path, lines: [start, end], selector, excerpt }
                     — the human selected into a frame with the Select tool. path and lines land in source (open-in-editor exact), selector in the live DOM, excerpt is the JSX span. "generated": true marks runtime-created DOM: lines point at the nearest stamped ancestor (no stamp at all: the frame's first line), excerpt becomes live outerHTML, trust the selector.

\`spool flows\` prints { frames, edges, unreadable } — every edge { from, to, certainty: "will" | "might", sites: [{ path, line, conditional? }] }, "verified": true once a real session took it, "missing": true on targets no frame answers (typo'd ui.go literals included), and unreadable entries { frame, path, line } for navigation whose destination cannot be read: together, the todo list when wiring a flow.`,
};

export function skillText(topic?: string): string {
	if (topic === undefined) return overview;
	const text = topics[topic];
	if (text === undefined) {
		throw new SpoolError(`no skill topic "${topic}" — topics: ${Object.keys(topics).join(", ")}`);
	}
	return text;
}
