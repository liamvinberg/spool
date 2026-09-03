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

/**
 * The installed-package anchor, resolved on demand. The daemon now reaches this
 * module to frame the agent it spawns (#191), which puts it on the import graph
 * of browser-environment tests where `import.meta.url` is not a file URL — so
 * this must not run merely because the module loaded.
 */
const spoolPackageJson = () => fileURLToPath(new URL("../package.json", import.meta.url));

const overview = `spool — the live prototyping canvas. Frames are TSX components in design/ on disk; the canvas is a projection the human arranges and plays. You author files; spool renders, links, and verifies them.

This skill is the complete contract: if it isn't here, spool doesn't do it.

The one law: never write app-owned files — design/canvas.json and design/.spool/ are spool's. Everything else under design/ is yours to author, rename, and delete. Frame authoring needs no locks or shared registries: parallel agents stay safe by writing separate frame folders. Lifecycle commands coordinate machine-global state inside spool.

A frame is born by writing design/frames/<name>/frame.tsx default-exporting one React component — no registration, no \`spool new\`. It appears on the canvas live. Variants are \`--\`-named sibling folders (checkout--empty). spool owns the document: pinned React, Tailwind compiled at serve, preflight, tokens, fonts, the flow runtime are all injected — write only the component. Frames render nowhere outside spool.

Lifecycle (offline, take a path):
  spool init [path]     scaffold design/, register the project, and open its tab
  spool open [path]     register an existing project by walk-up and open its tab
  spool remove [path]   forget one exact registered root without deleting its files
  spool check [path]    strictly type-check frames without starting spool

For a disposable implementation lane, run \`spool open <lane>\` before verification and \`spool remove <lane>\` before erasing the worktree. Never alias a lane to the registered main checkout: verification must read the lane's source.

Read verbs (work from any cwd inside a registered project, auto-start the daemon):
  spool selection       what the human points at, as one <selection> block: frames and elements, paths and lines
  spool flows           the link graph, read from source: edges, certainty, verified walks
  spool shot <frame>    headless screenshot of the frame
  spool logs <frame>    the same scenario boot's console, cached by compiled source
  spool url <frame>     mint a player URL; --raw mints the bare frame document
  spool skill [topic]   this text (needs nothing)

The daemon: \`spool serve\` / \`spool status\` / \`spool stop\` are the handles; \`spool autostart\` makes it start at login (macOS); \`spool upgrade\` installs the latest release and restarts it. The CLI boots frames in spool's own headless Chrome; it never reads the human's canvas.

History: where a project's design/canvas.json says \`"history": true\`, the daemon commits design/ for you — everything that changed lands as one \`design: <counts>\` commit on the checked-out branch once the folder has been quiet for 45 seconds. So never commit design/ yourself and never stage it: the save is built from its own index, your staging area is left exactly as you found it, and spool never pushes. \`spool init\` turns history on and says so (\`spool init --no-history\` starts a project without it); a project older than the flag has no key, which reads as off; \`"history": false\` in ~/.spool/config.json turns it off on that machine whatever a project asks for. A repository mid-merge, mid-rebase, on a detached HEAD, or with its index held waits for the next window.

Topics — \`spool skill <topic>\`:
  frames      the design/ contract: folders, sidecars, shared/, libraries
  flows       data-go, ui.go/back/state/use, sessions, arrows
  scenarios   named seeds: { state }
  styling     Tailwind, tokens.css, cn(), motion
  verbs       the loops: shot, logs, url, selection, flows`;

const topics: Record<string, () => string> = {
	// Pages group journeys, not performance budgets (#128). Readable documents
	// are bounded by viewport area, so keep the frames topic silent on page size.
	frames: () => `Everything lives under design/:

  frames/<name>/frame.tsx    default-exports one React component: the frame
  frames/<name>/frame.json   geometry sidecar: you write { w, h }, spool adds { x, y } (integers, px)
  frames/<name>/*            anything else the frame imports relatively
  frames/<page>/<name>/      a page: a folder grouping frames, its own canvas (below)
  frames/<page>/<page>/      pages hold pages, to any depth (below)
  shared/ui/                 shared components: kebab-case files, no barrels
  shared/lib/utils.ts        cn() — clsx + tailwind-merge
  shared/tokens.css          the single token file (topic: styling)
  shared/transitions.css     player transition styling, plain CSS (topic: flows)
  shared/fonts.css           @import / @font-face, injected into every document
  shared/importmap.json      URL imports for libraries (below)
  shared/scenarios/*.json    named seeds (topic: scenarios)
  shared/assets/             images and fonts more than one frame uses (below)
  AGENTS.md, CLAUDE.md       init's signposts pointing here; .gitignore covers .spool/
  canvas.json, .spool/       app-owned — never write these

Names are folder names — no leading dot, no slashes. Variants are \`--\`-suffixed siblings (checkout--empty), complete frames in their own right and valid walk targets. Renaming a frame is renaming its folder: update data-go and ui.go literals that target it, or the map marks them missing. Deleting is deleting the folder.

Pages group frames into journeys: a folder under frames/ without a frame.tsx is a page, and its subfolders are frames or pages of their own, to any depth. A page is named by its path under frames/ (explorations/chat); each page is its own canvas, and the flat top level is the permanent root page. Start flat — introduce pages when the project grows and flows cluster into distinct journeys, and nest them when one journey holds several. Frame names stay identity project-wide: unique across every page at every depth (two claimants is a loud error naming both), so walk targets, URLs, thumbnails, and geometry all survive moves. A page's own name only has to be free among the pages beside it, so explorations/chat and site/chat are two pages rather than a collision. Create a page by creating its folder; move a frame or a page by moving its folder. Import shared/ by its design-relative path — import { cn } from "shared/lib/utils" — which resolves from any frame at any depth, so a move never breaks it; a stylesheet writes the same form (@import "shared/tokens.css"). A \`../\` path into shared/ still compiles, but it counts folders and a move changes the count; spool re-aims such imports when it moves a folder, a folder moved outside spool is yours to re-aim. The canvas reflects either kind immediately. Walks cross pages freely: the player ignores pages entirely, and on the canvas a walk that lands on another page docks on the frame declaring it as a tag naming the target and its page — pressing it goes there. A walk that lands nowhere is not drawn at all: there is nowhere to press, so a name no frame answers to and a destination the parser cannot read are reported by \`spool flows\` and by this skill rather than on the canvas.

frame.json is the one file both hands write, geometry only, and the split is fixed: you write the size, spool writes the position. State every new frame's size — write \`{ "w": 1440, "h": 900 }\` before its frame entry and the frame's first appearance is already that size, placed beside its own page's frames and never on top of them, spool completing the same file with x and y. Writing it afterwards costs only that first appearance: a frame whose size changes has its picture retaken, whichever hand changed it. Leave the size out and the frame is 1440×900, which is a size to choose rather than one to inherit — a phone is 390×844 and says so. Write all four numbers only to move something: a placement already on disk is never overwritten, and neither are bytes spool cannot read, so a sidecar caught mid-write is safe. The human's drags and resizes rewrite the file after that. shot and logs only read geometry and never create this file. Beyond that, the rail drives folder operations for the human: rename, move a frame between pages, move a page into or out of another, duplicate, new page, and delete to the OS Trash. Frame source the human edits only as span patches: one gated op — a class token, a string attribute, an element's text, an element removed — spliced into the characters it names, the rest of the file byte-identical, refused outright where it could not be made honestly. Swapping an image is the one op that also writes a file: the picture lands beside the frame, the import is written, and \`src\` is pointed at the identifier, because an image is an import and never a URL. Expect a frame you authored to come back with a value changed and its shape intact; you stay the author.

The rail keeps a manual order for the pages a page holds and for the frames on it: the hands' arrangement, stored in canvas.json, which is app-owned and never yours to write. A frame you create arrives at its alphabetical spot, and a \`--\` variant arrives beside its base, so a well-named variant files itself. There is no order verb.

The component: a React function component, hooks and all, rendered into #root of a document spool assembles — finished CSS, tokens, fonts.css, the import map, and the runtime are injected; html, body, and #root have height: 100%, so h-full reaches the frame edge. Nested flex-fill chains need a definite h-full at each link; min-h-full does not give flex-1 a definite height. Frames are blank until React commits; the canvas covers boots with thumbnails. State split: useState is what a widget feels, ui.state is what the app knows (topic: flows).

shared/ui components take props, never knowledge — importing "spool" there fails the compile. Flow and app state live in frames; a shared component receives values and callbacks. That boundary is what keeps shared/ui able to move into a product unchanged.

Libraries: design/ never gets a package.json and nothing is npm-installed there. Imports resolve through shared/importmap.json to URLs (esm.sh works well); init pins clsx, tailwind-merge, class-variance-authority, and motion. A React-based library must not bundle its own React (esm.sh: ?external=react,react-dom) — spool pins react, react-dom, react-dom/client, react/jsx-runtime, and "spool" itself, and its pins always win, so exactly one React runs. A specifier starting with shared/ never reaches the import map — it is the project's own shared/ folder (topic: frames). Plain .css imports from any source file land in the document as-is.

Static assets: import the file and use the value. The compiler bakes it into the document — there is no asset URL and no asset route, so a project path written as a URL string (<img src="/logo.png">, <img src="./logo.png">) still has nothing to answer it.

  import hero from "./hero.png";
  import logo from "shared/assets/logo.svg";
  <img src={hero} />
  <div style={{ backgroundImage: \`url(\${logo})\` }} />

Kinds: .png, .jpg, .jpeg, .webp, .gif, .svg; a .json import parses into an object and a .txt import is the file's text. Put an asset beside the frame that uses it; move it to shared/assets/ when a second frame does. It must be an import and never a URL string: the import is what puts the file in the frame's closure, so editing it reissues the document and its cover. One document carries at most 512 KB of images — that is base64, so roughly 385 KB of real file — and the compile fails naming the file when it doesn't fit; nothing is downscaled. Video and audio are not supported. Remote image URLs still work in a live frame, but nothing fetched ever appears in a still.`,

	flows: () => `Navigation is walking: a session stands in one frame and walks to another by name.

data-go="<frame-name>" on any element walks there on click — nearest data-go ancestor wins, anchors get preventDefault, variants are valid targets. data-transition="<type>" on the same element names the move for transition styling (felt in the player). That is all the markup sugar; everything richer is code:

  import { ui } from "spool";
  ui.go(name, patch?)   merge patch into ui.state, push this frame onto the stack, walk
  ui.back()             pop the stack and walk back; empty stack is a quiet no-op
  ui.state              the session's flat shared state: a plain mutable object, any write re-renders subscribers
  ui.use()              hook — subscribe the calling component to ui.state changes
  ui.copy(text)         write text to the clipboard through the trusted canvas or player

For a shared component, keep the literal ui.go("target") call or data-go navigation in the frame-owned file and pass a callback or prop into shared UI. Spool does not traverse imports to guess a flow claim.

Coded walks carry no transition name — data-transition rides the element, ui.go has no third argument. Walking to a frame that doesn't exist logs an error and stays put on the canvas and in the player, so a typo never eats the session; a bare frame document walks by navigation and lands on the daemon's 404 instead (topic: verbs). ui.state is schemaless and shared by every frame in the session: initialize defensively (ui.state.items ??= [...]) because any frame can be a session's first. Top-level keys are the unit of reasoning; nested writes still react. Writes belong in handlers and effects, never in a render — a write from a component body makes React run that render again, so the value that render read is dropped, and the runtime warns once per site in the frame's console. A one-shot flag a walk hands over is read in render and cleared in an effect, never cleared by the render that reads it.

Clipboard writes are \`await ui.copy(text)\` directly inside a click or non-reserved key handler. Show copied state only after that promise fulfills; browser denial rejects with its original error name and message. Clipboard reads and paste are not available.

The session seeds from a scenario before first render — a frame never renders unseeded (topic: scenarios). ?scenario=<name> on a frame document's URL names the seed, and a name different from the running session's restarts it. Two surfaces carry a session across a walk. On the canvas the walk hands it to the next frame, and every frame on a page stands in one session: a write to ui.state in one frame re-renders the frames beside it through their ui.use(), and a frame booting onto that page joins what was already written. Two frames side by side are two clients of one app — put a sender and a receiver next to each other and click. The page's session lives as long as the canvas tab; reload the tab to start it over. In the player the whole walk happens inside one document, and every load is a fresh session — reload is restart. A bare frame document opened on its own (\`spool url --raw\`) carries nothing: it is sandboxed onto an opaque origin with no storage, so its session ends with the document and a walk out of it starts the next frame from the scenario (topic: verbs).

Arrows claim what the code says. Every literal data-go target and ui.go(name) call anywhere in a frame's folder is an edge, drawn from the element that causes it: solid when the walk is unconditional (will go), faint when the literal sits inside a branch — ternary, if/else, switch, &&/|| (might go; ui.go(ok ? "receipt" : "topup") draws two faint arrows). A destination the parser cannot read (ui.go(routeFor(state))) draws nothing and is reported by \`spool flows\` as unreadable — prefer literal targets when you want the map to show the flow. Playing never adds or removes an arrow; real walks only flip verified marks on derived edges, dropped when the from-frame's source changes. A headless shot/logs boot never verifies anything.

The player composes every frame into one document, so walks are View Transitions, not navigations: crossfade by default; morphs happen wherever two frames give an element the same view-transition-name. Each swap carries its direction (forward, back) plus any data-transition type as View Transitions types, not root attributes: in shared/transitions.css a bare ::view-transition-* rule styles every swap alike, and :active-view-transition-type() picks one out, plain CSS — html:active-view-transition-type(forward)::view-transition-old(root) { animation: 0.2s slide-out; }. A data-transition type is active alongside its direction, so the narrower rule comes later in the file. Reduced motion is respected. Screen components mount fresh on every arrival.`,

	scenarios:
		() => `shared/scenarios/<name>.json = { "state": { ... } } — one named way the app can be. state seeds ui.state at session start. The key is optional; no default.json means an empty seed. Names are file names: no leading dot, no slashes.

default.json is what loads when nothing else is named or resumed: canvas plays, shot/logs boots. The player URL takes ?scenario=<name>; a frame document's URL takes the same query, and naming a different scenario restarts the session. Reloading the tab re-reads the file, so an edited seed lands without a new URL.

Frames never branch on which scenario is loaded — no scenario name in ui.state, no "if demo". A scenario is felt through what it seeds: empty is an empty list in state, an error is a flag in state that the frame renders. If a frame needs a flag, that flag is state.

There is no fake backend: a frame's fetch reaches the real network. What the app knows lives in ui.state, seeded by the scenario and written by the frame; a request the prototype only pretends to make is an optimistic ui.state update and nothing else.

A scenario file that is missing or broken never blanks the frame: it plays with an empty seed and the error lands in the frame's console — \`spool logs\` shows it.`,

	styling:
		() => `Tailwind v4, compiled at serve: write utility classes in JSX and the document arrives with finished CSS — theme, preflight, exactly the utilities your source uses. No config file, no directives, no build step of yours; the compiler is spool's, pinned per format version, arbitrary values and variants all working.

Tailwind v4 puts important at the end: mt-3.5!, not !mt-3.5.

Classes first, real CSS when classes can't say it: a <style> element in the frame for one-offs, or a plain .css import. transitions.css and fonts.css stay plain CSS.

Compose classes with cn() from shared/lib/utils.ts — cn() only, never template-literal class strings. Variant components ride cva (pinned).

Tokens live in shared/tokens.css, the single token file and the only stylesheet the Tailwind compile reads (plus its relative @imports; @plugin and @config are not supported):
  - distilled from a product: paste its variables into :root verbatim, names kept
  - born in spool: declare under @theme, and utilities pick them up (--color-surface → bg-surface)
  - bridging: @theme inline aliases existing :root variables into utility names
One file, both blocks — shadcn v4's shape. Non-Tailwind consumers can import the same file; browsers skip @theme.

Fonts: shared/fonts.css is injected into every document — @import url(...) for hosted fonts, @font-face with absolute/data src, or @font-face whose url() is a relative path from that file (shared/assets/fonts/local.woff2), which spool reads and carries in the document up to 1 MB. woff2, woff, ttf, otf.

Motion is for interaction feel — the motion library is pinned (import { motion } from "motion/react"): hover, press, drag, springs, layout animation inside a frame. Screen-to-screen motion is never animated from a frame; it belongs to the flow layer (topic: flows). Other animation libraries: add them to the import map.

The document's baseline: preflight (the same zero a product starts from), tokens, fonts, height chain at 100%. Frames add nothing global — no resets, no font stacks in components; identity lives in tokens.`,

	verbs: () => `The project verbs — selection, flows, shot, logs, url — resolve the project by walking up from cwd to design/canvas.json and refuse roots they don't know (\`spool open\` once per machine registers), and auto-start the daemon; \`spool status\` prints where it listens and warns when a running daemon predates the CLI (\`spool stop\`, then any verb, updates it). init and open work offline; skill needs nothing.

shot and logs are two outputs of one boot: the frame's really-served document in spool's own headless Chrome, seeded with --scenario <name> (default when omitted), viewport from frame.json (else a narrated 1440×900). Device scale is picked for legibility: 2× for narrow frames, tapering above 800px wide so the raster stays near what a vision model keeps. Reading a missing or invalid sidecar never creates it.

  spool shot <frame> [--viewport <width>x<height>] [--at <milliseconds>] [--scenario <name>]
                       Boots headless and writes design/.spool/verify/<frame>.png, printing the path.
                       A frame much taller than a screen writes top-to-bottom slices <frame>.1.png … <frame>.N.png instead, one printed path per line, each slice legible on its own with a small overlap across cuts. Read every printed file — the layout's truth is the whole stack.
                       --viewport sets exact positive-integer CSS pixels instead of frame.json.
                       --at sets the post-commit settle wait; the default is 300ms.
                       Doesn't compile: the toolchain's error verbatim on stderr, exit 1, no browser.
                       Throws uncaught while booting: shot still written, errors on stderr, exit 1.
                       Waits for #root to have children (up to 10s), settles, then shoots; a frame that renders nothing still shoots.
  spool logs <frame> [--scenario <name>]
                       Prints the same scenario boot's console as [type] text lines, uncaught errors included.
                       The cache identity is compiled document plus scenario name. Code and stylesheet edits re-boot; a scenario JSON edit under the same name does not. A shot always boots fresh and refreshes that scenario's cache, so after editing data run shot first, then logs.
                       A replay says "cache matches current compiled source": it is the fresh boot that shot recorded, not evidence that a source edit was ignored.
                       Scenario failures land here; read shot and logs together.

The first browser boot on a machine downloads spool's pinned headless Chrome once, narrated on stderr — relay the wait, don't kill it.

The drive loop — \`spool url <frame>\` prints the player URL after checking the frame exists. Append &scenario=<name> to pick its seed. \`spool url --raw <frame>\` prints the stable bare frame document instead; append ?scenario=<name> there.

The raw document is one frame and nothing else: read its DOM, check its styling, shoot it without chrome in the way. It is sandboxed onto an opaque origin, and that costs it every session guarantee the canvas and the player keep. It has no storage, so a reload starts over. A walk out of it is a real browser navigation, so the next frame boots from the scenario with the state left behind. Its target probe cannot read a cross-origin answer, so every walk logs a CORS error on the frame document URL that the walk itself ignores, and a walk to a name no frame answers lands on the daemon's 404 text instead of staying put. Drive the player for anything that walks or carries state; reach for the raw document only when the player's chrome is what's in the way.

For Playwright, wait for DOMContentLoaded and then a meaningful selector from the frame. Do not wait for networkidle: Spool's live reload connection stays open. The player mounts every frame inside a sandboxed \`<iframe id="spool-player">\`, so its selectors go through \`page.frameLocator("#spool-player")\` — a top-level locator never resolves there and the wait times out. On a --raw URL the frame is the page, so top-level locators are the right ones. The played page is never scaled: it lays out at the real viewport width, capped at the frame's authored w, and is as tall as its content. So open the page at least w wide or the frame renders at the narrower width its own CSS answers with, exactly as that site would in a narrow browser. To use the dependency belonging to this exact Spool install from a repo script, copy the installed-package anchor printed below verbatim:

  import { createRequire } from "node:module";
  const requireFromSpool = createRequire(${JSON.stringify(spoolPackageJson())});
  const { chromium } = requireFromSpool("playwright-core");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); // at least the frame's size
  await page.goto(playerUrl, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator("#spool-player"); // on a --raw URL, use page itself
  await frame.locator("[data-ready='true']").waitFor(); // use a meaningful selector

Walks you take in the player flip verified marks on the map's derived edges — \`spool flows\` shows which claims a real session has confirmed, most valuable on might edges: a verified faint edge is a branch that actually fired. Reloading the played tab re-reads the scenario, so edit-seed-reload iterates on one URL.

\`spool selection\` prints what the human points at as one block — the same bytes a spool agent-chat prompt carries, and nothing at all when nothing is selected:

  <selection>
  cart — design/frames/app/cart/frame.tsx — 480×640
  checkout · line-item — design/frames/app/checkout/frame.tsx:44-56
    <li className="flex items-baseline justify-between py-2">…
    3 excerpts elided over budget — read the paths
  </selection>

A frame is its name, its source path and its size. An element is its frame, what the source calls it, and its path with the line range the stamp spans; the line under it is the JSX excerpt, capped at 240 characters. Every entry always contributes that pointer — read the path when you need more — and only excerpts are ever dropped, which the block says out loud when it happens. A runtime-created element takes its name and excerpt from the live DOM and its lines from the nearest stamped ancestor.

\`spool flows\` prints { frames, edges, unreadable } — every edge { from, to, certainty: "will" | "might", sites: [{ path, line, conditional? }] }, "verified": true once a real session took it, "missing": true on targets no frame answers (typo'd ui.go literals included), and unreadable entries { frame, path, line } for navigation whose destination cannot be read: together, the todo list when wiring a flow.`,
};

export function skillText(topic?: string): string {
	if (topic === undefined) return overview;
	const text = topics[topic];
	if (text === undefined) {
		throw new SpoolError(`no skill topic "${topic}" — topics: ${Object.keys(topics).join(", ")}`);
	}
	return text();
}
