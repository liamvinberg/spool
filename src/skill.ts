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

const overview =
	() => `spool — the live prototyping canvas. Frames are TSX components in design/ on disk; the canvas is a projection the human arranges and plays. You author files; spool renders, links, and verifies them.

This skill is the complete contract: if it isn't here, spool doesn't do it.

The one law: never write app-owned files — design/canvas.json and design/.spool/ are spool's. Everything else under design/ is yours to author, rename, and delete. Frame authoring needs no locks or shared registries: parallel agents stay safe by writing separate frame folders. Lifecycle commands coordinate machine-global state inside spool.

A frame is born by writing design/frames/<name>/frame.tsx default-exporting one React component — no registration, no \`spool new\`. It appears on the canvas live. Variants are \`--\`-named sibling folders (checkout--empty). spool owns the document: pinned React, Tailwind compiled at serve, preflight, tokens, fonts, the flow runtime are all injected — write only the component.

Lifecycle (offline, take a path):
  spool init [path]     scaffold design/, register the project, and open its tab
  spool init [path] --team <team>    start it as a team project instead (needs \`spool login\` and the network)
  spool init [path] --local          keep it on this machine only; an editor in a team must say which, and plain init then writes nothing and names the choice: relay it to the human
  spool open [path]     register an existing project by walk-up and open its tab
  spool remove [path]   forget one exact registered root without deleting its files
  spool check [frame…]  strictly type-check frames and what they import, without starting spool or writing anything; name frames, their folders or a page folder to check just those, none for all. Ends with "checked N frames (…), M errors"; a slow frame is spelled out only when named

For a disposable implementation lane, run \`spool open <lane>\` before verification and \`spool remove <lane>\` before erasing the worktree. Never alias a lane to the registered main checkout: verification must read the lane's source. In a team project a lane is one more local copy of the same live canvas: open, check and the read verbs there fetch its design/ (skill never does), its saves reach the team like any other, and \`spool remove <lane>\` forgets that copy without touching the team.

Read verbs (work from any cwd inside a registered project, auto-start the daemon):
  spool selection       what the human points at, as one <selection> block: frames and elements, paths and lines
  spool flows           the link graph, read from source: edges, certainty, verified walks
  spool shot <frame>…   headless screenshot of each frame or page named, with its console errors
  spool logs <frame>    the same scenario boot's console, cached by compiled source
  spool url <frame>     mint a player URL; --raw mints the bare frame document
  spool skill [topic…]  this text, or the topics named (several at once); reads nothing, fetches nothing

To click, type or reach a state before a shot, drive the bare frame with spool's own Playwright and Chromium: save this as drive.mjs anywhere and run \`node drive.mjs "$(spool url --raw <frame>)"\` (the same command you run spool with). *.spool.localhost needs no host rule.

  import { createRequire } from "node:module";
  const { chromium } = createRequire(${JSON.stringify(spoolPackageJson())})("playwright-core");
  const browser = await chromium.launch({ channel: "chromium-headless-shell" }); // spool's pinned build
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); // the frame's size
  await page.goto(process.argv[2], { waitUntil: "domcontentloaded" }); // never networkidle: live reload stays open
  await page.locator("#root > *").first().waitFor(); // the frame has rendered
  await page.getByRole("button", { name: "Continue" }).click();
  await page.screenshot({ path: "after.png" });
  await browser.close();

A bare frame has no storage and walks out by real navigation; drive the player URL for walks and shared state (topic: verbs). A state you only need to open in is a scenario (topic: scenarios), not a driver.

The daemon: \`spool serve\` / \`spool status\` / \`spool stop\` are the handles; \`spool autostart\` makes it start at login (macOS); \`spool upgrade\` installs the latest release and restarts it. The CLI boots frames in spool's own headless Chrome; it never reads the human's canvas.

History: where design/canvas.json says \`"history": true\`, the daemon commits design/ for you, so never commit or stage design/ yourself (topic: history).

Team projects: a spool.json beside design/ makes design/ a live local copy of a team project on spool.page. Write frames exactly as anywhere else; a file a teammate changed since you read it is theirs now, so read it again before editing. Commit spool.json, never design/, and never write spool.json yourself. Keep each file under 25 MB: a bigger one stays on this Mac and teammates see it missing, so shrink video and large images before they go in design/ (topic: team); the next project verb or check you run there names each file that didn't travel and why. A spool.json with no design/ beside it means run \`spool open\` there, which fetches it (topic: team: conflicts, what travels, limits, git, linking a frame).

Moving a team project is the person's call, never yours: ask them first, and only once they said yes run
  spool move --team <address> [--name <name>]           this project to another team (the same project; its old address leads on)
  spool move <team>/<project> --team <address>          one that isn't on this Mac
  spool move --out                                      this project out of its team: design/ goes back into git
  spool move --into <checkout>                          this project, kept in no repo, into a clone of its repo
with --yes. Without --yes it says what the move does (who loses the project, the commits it makes, the folder it moves) and asks; relay that to the person when you have no terminal to ask at.

Topics — \`spool skill <topic>…\`:
  frames      the design/ contract: folders, sidecars, shared/, libraries
  flows       data-go, ui.go/back/state/use, sessions, arrows
  sharing     sharing pages with people outside the project, and signing in
  team        team projects: sync, conflicts, what travels, limits, git, linking a frame
  history     design/ committed for you, and its switches
  scenarios   named seeds: { state }
  styling     Tailwind, tokens.css, cn(), motion
  shaders     WebGL, WebGPU, Three.js, shader authoring and verification
  verbs       the loops: shot, logs, url, selection, flows`;

const topics: Record<string, () => string> = {
	// Pages group journeys, not performance budgets (#128). Readable documents
	// are bounded by viewport area, so keep the frames topic silent on page size.
	frames: () => `Everything lives under design/:

  frames/<name>/frame.tsx    default-exports one React component: the frame
  frames/<name>/frame.json   geometry sidecar { w, h, x, y } (integers, px): you write w and h, spool adds x and y unless you do
  frames/<name>/*            anything else the frame imports relatively
  frames/<page>/<name>/      a page: a folder grouping frames, its own canvas (below)
  frames/<page>/<page>/      pages hold pages, to any depth (below)
  shared/ui/                 shared components: kebab-case files, no barrels
  shared/ui/<look>/theme.css a theme a frame may import for a look of its own (topic: styling)
  shared/lib/utils.ts        cn() — clsx + tailwind-merge
  shared/tokens.css          the project's tokens, for every frame without a theme (topic: styling)
  shared/transitions.css     player transition styling, plain CSS (topic: flows)
  shared/fonts.css           @import / @font-face, injected into every frame without a theme
  shared/importmap.json      URL imports for libraries (below)
  shared/scenarios/*.json    named seeds (topic: scenarios)
  shared/assets/             images and fonts more than one frame uses (below)
  shared/icon.*              the project's icon on its tab and on Home: one icon.svg, .png, .webp or .jpg
  shared/thumbnail.*         the project's picture on Home: one thumbnail.svg, .png, .webp or .jpg, yours to design (an SVG, or a PNG you shot of a draft frame with \`spool shot\` and saved here); without one Home shows the top-left frame
  AGENTS.md, CLAUDE.md       init's signposts pointing here; .gitignore covers .spool/
  canvas.json, .spool/       app-owned — never write these

A frame is named by its path under frames/: checkout on the root page, shop/checkout on the page shop. That full name is how everything addresses it (data-go, ui.go, links, the CLI, URLs) with no shorthand, so the same folder name can sit on two pages and a name never means a different frame by accident. Folder names have no leading dot and no slashes, and only have to be free among the folders beside them. Variants are \`--\`-suffixed siblings (checkout--empty), complete frames in their own right and valid walk targets. Deleting is deleting the folder.

Pages group frames into journeys: a folder under frames/ without a frame.tsx is a page, and its subfolders are frames or pages of their own, to any depth. A page is named by its path under frames/ (explorations/chat); each page is its own canvas, and the flat top level is the permanent root page. Start flat — introduce pages when the project grows and flows cluster into distinct journeys, and nest them when one journey holds several. A page's own name only has to be free among the folders beside it, so explorations/chat and site/chat are two pages, and shop/buttons and vercel/buttons are two frames. Create a page by creating its folder. Rename or move frames and pages on the canvas: a frame's name is its path, so spool writes every data-go, ui.go and links literal that named a moved frame at its new name, in frames and shared/ alike. A frame or page renamed or moved outside spool leaves those literals naming the old path: \`spool flows\` marks them missing, and they are yours to rewrite. A destination spool cannot read (a constant, a lookup, a built string) is never rewritten, which is one more reason to keep targets literal. Import shared/ by its design-relative path — import { cn } from "shared/lib/utils" — which resolves from any frame at any depth, so a move never breaks it; a stylesheet writes the same form (@import "shared/tokens.css"). A \`../\` path into shared/ still compiles, but it counts folders and a move changes the count; spool re-aims such imports when it moves a folder, a folder moved outside spool is yours to re-aim. The canvas reflects either kind immediately. Walks cross pages freely: the player ignores pages entirely, and on the canvas a walk that lands on another page docks on the frame declaring it as a tag naming the target and its page — pressing it goes there. A walk that lands nowhere is not drawn at all: there is nowhere to press, so a name no frame answers to and a destination the parser cannot read are reported by \`spool flows\` and by this skill rather than on the canvas.

frame.json is the one file both hands write, geometry only, and the split is fixed: you write the size, spool writes the position. State every new frame's size — write \`{ "w": 1440, "h": 900 }\` before its frame entry and the frame's first appearance is already that size, placed beside its own page's frames and never on top of them, spool completing the same file with x and y. Writing it afterwards costs only that first appearance: a frame whose size changes has its picture retaken, whichever hand changed it. Leave the size out and the frame is 1440×900, which is a size to choose rather than one to inherit — a phone is 390×844 and says so. Writing x and y yourself is fine, and is how you move or tidy frames. When you rewrite w or h of a frame already placed, keep its x and y: a file with only a size is placed afresh. A placement already on disk is never overwritten, and neither are bytes spool cannot read, so a sidecar caught mid-write is safe. The human's drags and resizes rewrite the file after that. shot and logs only read geometry and never create this file. Beyond that, the rail drives folder operations for the human: rename, move a frame between pages, move a page into or out of another, duplicate, new page, and delete to the OS Trash. Frame source the human edits only as span patches, and only three ways: an element's words, an element taken out, and an element moved before or after a sibling written beside it in the same parent. Each is one gated op spliced into the characters it names, the rest of the file byte-identical, refused outright where it could not be made honestly. Styling, layout, images, attributes, hiding, adding an element and moving one into another container are yours alone; a human who wants one of those changed asks you. Your side of the deal is what lets those hand edits land: use named components, write words as JSX text rather than computed strings, and write lists as literal arrays that a .map() renders, so a person can change words, delete a row and reorder rows by hand. Keep siblings a person may reorder as plain children of one parent rather than behind a condition or a spread. Expect a frame you authored to come back with words changed, an element gone or siblings in a new order, and its shape otherwise intact; you stay the author.

The rail keeps a manual order for the pages a page holds and for the frames on it: the hands' arrangement, stored in canvas.json, which is app-owned and never yours to write. A frame you create arrives at its alphabetical spot, and a \`--\` variant arrives beside its base, so a well-named variant files itself. There is no order verb.

The component: a React function component, hooks and all, rendered into #root of a document spool assembles — finished CSS, tokens, fonts (fonts.css, or its theme's), the import map, and the runtime are injected; html, body, and #root have height: 100%, so h-full reaches the frame edge. Nested flex-fill chains need a definite h-full at each link; min-h-full does not give flex-1 a definite height. Frames are blank until React commits; the canvas covers boots with thumbnails. State split: useState is what a widget feels, ui.state is what the app knows (topic: flows).

Frames are https-only, on the canvas, in the player, in shot and logs and in an export alike. A frame's fetch, script and image may reach https:, data: and blob: URLs and spool's own libraries, and nothing over plain http: a call to http://localhost:3000 or to any plain-http address on your network is refused before it leaves, and the frame's console names the address it refused (\`spool logs\` shows it). Never point a frame at a local dev server. Fake the backend instead: seed what it would answer with a scenario (topic: scenarios), and write what it would do as a mock module beside the frame that reads and writes ui.state. Frames have no localStorage or sessionStorage, anywhere they run: keep what must last a session in ui.state (topic: flows). A phone frame fills the whole screen, under the notch and the home bar, and pads itself with env(safe-area-inset-*).

shared/ui components take props, never knowledge — importing "spool" there fails the compile. Flow and app state live in frames; a shared component receives values and callbacks. That boundary is what keeps shared/ui able to move into a product unchanged.

Libraries: design/ never gets a package.json and nothing is npm-installed there. Imports resolve through shared/importmap.json to URLs (esm.sh works well); init pins clsx, tailwind-merge, class-variance-authority, and motion. A React-based library must not bundle its own React (esm.sh: ?external=react,react-dom) — spool pins react, react-dom, react-dom/client, react/jsx-runtime, and "spool" itself, and its pins always win, so exactly one React runs. A specifier starting with shared/ never reaches the import map — it is the project's own shared/ folder (topic: frames). Plain .css imports from any source file land in the document as-is.

Static assets: import the file and use the value. The compiler bakes it into the document — there is no asset URL and no asset route, so a project path written as a URL string (<img src="/logo.png">, <img src="./logo.png">) still has nothing to answer it.

  import hero from "./hero.png";
  import logo from "shared/assets/logo.svg";
  <img src={hero} />
  <div style={{ backgroundImage: \`url(\${logo})\` }} />

Kinds: .png, .jpg, .jpeg, .webp, .gif, .svg; a .json import parses into an object and .txt, .glsl, and .wgsl imports are the file's text (topic: shaders). Put an asset beside the frame that uses it; move it to shared/assets/ when a second frame does. It must be an import and never a URL string: the import is what puts the file in the frame's closure, so editing it reissues the document and its cover. One document carries at most 512 KB of images — that is base64, so roughly 385 KB of real file — and the compile fails naming the file when it doesn't fit; nothing is downscaled. Video and audio are not supported. Remote image URLs still work in a live frame and in its still, but nothing fetched ever appears in an export.`,

	flows: () => `Navigation is walking: a session stands in one frame and walks to another by name, which is its full path under frames/ (shop/checkout) from every page, its own included.

data-go="<frame>" on any element walks there on click — nearest data-go ancestor wins, anchors get preventDefault, variants are valid targets. data-transition="<type>" on the same element names the move for transition styling (felt in the player). That is all the markup sugar; everything richer is code:

  import { ui } from "spool";
  ui.go(name, patch?)   merge patch into ui.state, push this frame onto the stack, walk
  ui.back()             pop the stack and walk back; empty stack is a quiet no-op
  ui.state              the session's flat shared state: a plain mutable object, any write re-renders subscribers
  ui.use()              hook — subscribe the calling component to ui.state changes
  ui.copy(text)         write text to the clipboard through the trusted canvas or player

Shared components may own data-go attributes or invoke callbacks passed by the frame. Keep shared UI free of imports from "spool"; pass a callback or destination prop across that boundary.

Coded walks carry no transition name — data-transition rides the element, ui.go has no third argument. Walking to a frame that doesn't exist logs an error and stays put on the canvas and in the player, so a typo never eats the session; a bare frame document walks by navigation and lands on the daemon's 404 instead (topic: verbs). ui.state is schemaless and shared by every frame in the session: initialize defensively (ui.state.items ??= [...]) because any frame can be a session's first. Top-level keys are the unit of reasoning; nested writes still react. Writes belong in handlers and effects, never in a render — a write from a component body makes React run that render again, so the value that render read is dropped, and the runtime warns once per site in the frame's console. A one-shot flag a walk hands over is read in render and cleared in an effect, never cleared by the render that reads it.

Clipboard writes are \`await ui.copy(text)\` directly inside a click or non-reserved key handler. Show copied state only after that promise fulfills; browser denial rejects with its original error name and message. Clipboard reads and paste are not available.

The session seeds from a scenario before first render — a frame never renders unseeded (topic: scenarios). ?scenario=<name> on a frame document's URL names the seed, and a name different from the running session's restarts it. Two surfaces carry a session across a walk. On the canvas the walk hands it to the next frame, and every frame on a page stands in one session: a write to ui.state in one frame re-renders the frames beside it through their ui.use(), and a frame booting onto that page joins what was already written. Two frames side by side are two clients of one app — put a sender and a receiver next to each other and click. The page's session lives as long as the canvas tab; reload the tab to start it over. In the player the whole walk happens inside one document, and every load is a fresh session — reload is restart. A bare frame document opened on its own (\`spool url --raw\`) carries nothing: it is sandboxed onto an opaque origin with no storage, so its session ends with the document and a walk out of it starts the next frame from the scenario (topic: verbs).

Arrows claim what the code says. Every literal data-go target and ui.go(name) call anywhere in a frame's folder is an edge, drawn from the element that causes it: solid when the walk is unconditional (will go), faint when the literal sits inside a branch — ternary, if/else, switch, &&/|| (might go; ui.go(ok ? "receipt" : "topup") draws two faint arrows). A destination the parser cannot read (ui.go(routeFor(state))) draws nothing and is reported by \`spool flows\` as unreadable — prefer literal targets when you want the map to show the flow. Playing never adds or removes an arrow; real walks only flip verified marks on derived edges, dropped when the from-frame's source changes. A headless shot/logs boot never verifies anything.

The player composes every frame into one document, so walks are View Transitions, not navigations: crossfade by default; morphs happen wherever two frames give an element the same view-transition-name. Each swap carries its direction (forward, back) plus any data-transition type as View Transitions types, not root attributes: in shared/transitions.css a bare ::view-transition-* rule styles every swap alike, and :active-view-transition-type() picks one out, plain CSS — html:active-view-transition-type(forward)::view-transition-old(root) { animation: 0.2s slide-out; }. A data-transition type is active alongside its direction, so the narrower rule comes later in the file. Reduced motion is respected. Screen components mount fresh on every arrival.`,

	sharing:
		() => `Pages are shared from the canvas: right-click a page in the Pages panel and choose Share…. A share shows its pages to people outside the project, either named people, each signing in with one of the addresses named, or anyone with its link. It shows the pages as they settle, so later saves reach it. Anyone who can edit the project changes or stops its shares in the same sheet, and stopping one ends everyone's access at once. What a share shows is its frames' compiled code and the project's scenarios: keep secrets out of both. A walk that leaves the shared pages is pointed out in the sheet, never refused; whoever follows it is told that screen isn't shared with them.

Sharing needs this machine signed in. Run \`spool login\` to sign it in to its spool.page account in a browser (Google, an email code or a passkey). Over SSH, or anywhere with no browser of its own, it prints the sign-in link instead: sign in on any device, then paste the address that browser ends on (a 127.0.0.1 page that won't load) back into the terminal. The machine's session lives in macOS Keychain on a Mac and in a file only its owner can read under spool's state folder elsewhere, and renews while it is used. \`spool logout\` signs the machine out: it removes that credential and attempts remote revocation. Local authoring works without signing in.`,

	team: () =>
		`A spool.json beside design/ ({ "project": "https://spool.page/<team>/<project>" }) makes design/ a local copy of a team project. Every save in it reaches the team's other editors through spool.page within about a second, and theirs arrive here as real files, so write frames exactly as anywhere else; a file a teammate changed since you read it is theirs now, so read it again before editing. If your save reaches the team after a teammate's to the same file, spool merges the two line by line and the merge lands in the file; only where you both changed the same lines is yours set aside and the file takes theirs, and the person decides on the canvas whether to use theirs, use yours, or hand both to you. Only canvas.json, AGENTS.md, CLAUDE.md, frames/** and shared/** travel; .spool/ and design/.gitignore stay on this machine. A file stays on this Mac, unsent, when it is outside those, a symlink, or over 25 MB, and while sync is paused on a limit (the team's design/ at 1 GB, or more saves than spool.page takes) what changes waits here; the next project verb or check you run on the project names each file that didn't travel and why, and the pause, once each. Spool never compresses anything: shrink media on this Mac before it goes in design/, choosing the quality on purpose, and check the size it came out at — video with ffmpeg (\`ffmpeg -i in.mov -vf scale=-2:1080 -c:v libx264 -crf 28 -an out.mp4\`: a higher crf or a smaller scale is smaller and blurrier), images by resizing and re-encoding (\`sips -Z 2400 in.png\` on a Mac, or \`cwebp -q 80 in.png -o out.webp\`). design/ is out of git there (its own .gitignore is \`*\`) and history never commits it: commit spool.json, never design/. Git never writes to the team's copy: whatever a checkout, pull, reset or merge puts in design/ is never sent, and the team's version comes back over what the team has, while a file the team never had stays as git left it, unsent, until someone edits it; a design/ that vanishes is refilled, not deleted for the team. A spool.json with no design/ beside it means run \`spool open\` there, which fetches it (so do check and the read verbs; skill doesn't). Moving an existing project into a team is the human's, in the app (Move to team…): it uploads design/ and makes the one commit \`design: moved to Spool Cloud\`, which also adds "design/ is a spool canvas: run \`spool skill\` before working there." to the repo's AGENTS.md, so never untrack design/ or write spool.json yourself. A team project moved to another team keeps syncing at its new address before anyone pulls the commit that rewrote its spool.json; one moved out of its team stops syncing here and stays out of git until a pull brings design/ back. \`spool move\` does these moves (above), only once the person said yes. To show someone a frame of a team project, link it: the project's address with ?frame=<frame> (its full name, encoded: https://spool.page/devosurf/shop?frame=checkout%2Fcart) opens that frame played, in a browser, for anyone in the team.`,

	history: () =>
		`Where a project's design/canvas.json says \`"history": true\`, the daemon commits design/ for you — everything that changed lands as one \`design: <counts>\` commit on the checked-out branch once the folder has been quiet for 45 seconds. So never commit design/ yourself and never stage it: the save is built from its own index, your staging area is left exactly as you found it, and spool never pushes. \`spool init\` leaves history off and says so (\`spool init --history\` starts a project with it on); a project with no key reads as off; \`"history": false\` in ~/.spool/config.json turns it off on that machine whatever a project asks for. A repository mid-merge, mid-rebase, on a detached HEAD, or with its index held waits for the next window.`,

	scenarios:
		() => `shared/scenarios/<name>.json = { "state": { ... } } — one named way the app can be. state seeds ui.state at session start. The key is optional; no default.json means an empty seed. Names are file names: no leading dot, no slashes.

default.json is what loads when nothing else is named or resumed: canvas plays, shot/logs boots. The player URL takes ?scenario=<name>; a frame document's URL takes the same query, and naming a different scenario restarts the session. Reloading the tab re-reads the file, so an edited seed lands without a new URL.

Frames never branch on which scenario is loaded — no scenario name in ui.state, no "if demo". A scenario is felt through what it seeds: empty is an empty list in state, an error is a flag in state that the frame renders. If a frame needs a flag, that flag is state.

Spool runs no backend for a frame: its fetch reaches the real network, and only over https (topic: frames). What the app knows lives in ui.state, seeded by the scenario and written by the frame; a request the prototype only pretends to make is an optimistic ui.state update and nothing else.

A scenario file that is missing or broken never blanks the frame: it plays with an empty seed and the error lands in the frame's console — \`spool logs\` shows it.`,

	styling:
		() => `Tailwind v4, compiled at serve: write utility classes in JSX and the document arrives with finished CSS — theme, preflight, exactly the utilities your source uses. No config file, no directives, no build step of yours; the compiler is spool's, pinned per format version, arbitrary values and variants all working.

Tailwind v4 puts important at the end: mt-3.5!, not !mt-3.5.

Use Tailwind classes for component layout, spacing, colors, borders, and interaction states. Preserve exact values with arbitrary utilities when needed. Keep shared tokens, fonts, typography roles, keyframes, and complex selectors or effects in CSS; keep calculated positions, sizes, and zoom in inline styles. Give each property one owner instead of repeating it in classes and CSS.

Custom CSS remains supported: use a <style> element for a frame-local effect or import a plain .css file, including existing product component styles. Imported component CSS sits below utilities in the project layer, so a utility can override it. transitions.css and fonts.css stay plain CSS.

Compose classes with cn() from shared/lib/utils.ts — cn() only, never template-literal class strings. Variant components ride cva (pinned).

Tokens live in shared/tokens.css, the project's token file and the only stylesheet the Tailwind compile reads for a frame without a theme (plus its relative @imports; @plugin and @config are not supported):
  - distilled from a product: paste its variables into :root verbatim, names kept
  - born in spool: declare under @theme, and utilities pick them up (--color-surface → bg-surface)
  - bridging: @theme inline aliases existing :root variables into utility names
One file, both blocks — shadcn v4's shape. Non-Tailwind consumers can import the same file; browsers skip @theme.

Fonts: shared/fonts.css is injected into every frame without a theme — @import url(...) for hosted fonts, @font-face with absolute/data src, or @font-face whose url() is a relative path from that file (shared/assets/fonts/local.woff2), which spool reads and carries in the document up to 1 MB. woff2, woff, ttf, otf.

Themes: a frame may import a theme for a look of its own, the way a Vite app's entry imports its index.css — two design systems side by side, or a product and its marketing site, in one project. A theme is a stylesheet that imports tailwindcss; any other stylesheet stays plain component CSS.

  // frames/vercel/buttons/frame.tsx
  import "shared/ui/vercel/theme.css";

  /* shared/ui/vercel/theme.css */
  @import "tailwindcss";
  @theme { --color-primary: #000; }
  @font-face { font-family: "Geist"; src: url("../../assets/fonts/geist.woff2"); }

For that frame Tailwind compiles from the theme instead of tokens.css, and fonts.css is not injected: nothing project-wide reaches it, on the canvas, in the player and in an export alike. A theme carries its own fonts under fonts.css's rules, a relative url() resolving from the theme's own folder; its relative @imports resolve as tokens.css's do. One theme per frame: a frame whose imports reach two fails to compile, naming both. Shared components never import a theme: they use token names like bg-primary and wear the theme of whichever frame uses them. A frame that imports no theme uses tokens.css and fonts.css.

Motion is for interaction feel — the motion library is pinned (import { motion } from "motion/react"): hover, press, drag, springs, layout animation inside a frame. Screen-to-screen motion is never animated from a frame; it belongs to the flow layer (topic: flows). Other animation libraries: add them to the import map.

The document's baseline: preflight (the same zero a product starts from), tokens, fonts, height chain at 100%. Frames add nothing global — no resets, no font stacks in components; identity lives in tokens.`,

	shaders:
		() => `Shaders run inside an ordinary TSX frame's <canvas>. Put reusable effects in shared/ui/, with props for their inputs, so the component can move into the product. Frame and library imports follow the frames topic.

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

Verify with spool url, shot and logs: wait for async initialization, inspect rendered pixels, resize, and test reduced motion. A headless browser can choose a different backend from the visible browser: shot and logs say so in a [spool] line when WebGL ran in software (SwiftShader), and when a context was lost, so a black canvas is never a clean boot. shot --at <ms> seeks the frame's clocks, requestAnimationFrame and performance.now included, so an animated shader shoots at the same moment every time, however slowly software GL draws it. Check the canvas's still as well as the live frame and player. An export substitutes an image for each canvas: use a wrapper, classes or inline styles for layout, since a canvas tag selector will no longer match there. Spool preserves WebGL drawing buffers for export. A shader that renders once is enough for a still; animation need not run forever.`,

	verbs: () => `The project verbs — selection, flows, shot, logs, url — resolve the project by walking up from cwd to design/canvas.json or a team project's spool.json and refuse roots they don't know (\`spool open\` once per machine registers), and auto-start the daemon; \`spool status\` prints where it listens and warns when a running daemon predates the CLI (\`spool stop\`, then any verb, updates it) or runs from a checkout since deleted, which every verb warns of too. init and open work offline, except that a team project needs spool.page; skill needs nothing.

shot and logs are two outputs of one boot: the frame's really-served document in spool's own headless Chrome, the same browser that makes the canvas's pictures of frames, seeded with --scenario <name> (default when omitted), viewport from frame.json (else a narrated 1440×900), in the colour scheme the canvas shows (this machine's light or dark setting until a canvas has said). Device scale is picked for legibility: 2× for narrow frames, tapering above 800px wide so the raster stays near what a vision model keeps. Reading a missing or invalid sidecar never creates it.

  spool shot <frame>… [--viewport <width>x<height>] [--at <ms>[,<ms>…]] [--scroll <px>] [--scenario <name>]
                       Name every frame to check in one call, or a page folder for every frame under it: they boot in parallel in the same browser, the options applying to each. One block per frame on stdout, in the order named:
                         shop/checkout: shot, content 3765px tall, no console errors
                           <root>/design/.spool/verify/shop/checkout.1.png  css y 0-1800 of 3765, scale 1.111
                       The head line says the content's own height after fonts load; when the frame was shot at another height it names both (\`frame.json h 6400, content 6967\`): set frame.json's h from it. It ends with the console error count and any uncaught throws, or reads \`does not compile\`, \`not found\` or \`failed\` with the reason indented under it. Then each file with the CSS pixels it holds and the PNG pixels per CSS pixel, then each console error as a [type] line, an uncaught throw's stack read back to your .tsx files and lines, then each [spool] line: what renders wrong with a clean console, Tailwind classes no stylesheet built (\`classes with no CSS: bg-white, text-subtle\` — a token reset or renamed), a WebGL context lost, WebGL drawn in software (SwiftShader). The boot runs React's development build, so React's errors and warnings come in words.
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

The drive loop — \`spool url <frame>\` prints the player URL after checking the frame exists. Append &scenario=<name> to pick its seed. \`spool url --raw <frame>\` prints the stable bare frame document instead; append ?scenario=<name> there.

The raw document is one frame and nothing else: read its DOM, check its styling, shoot it without chrome in the way. It is sandboxed onto an opaque origin, and that costs it every session guarantee the canvas and the player keep. It has no storage, so a reload starts over. A walk out of it is a real browser navigation, so the next frame boots from the scenario with the state left behind. Its target probe cannot read a cross-origin answer, so every walk logs a CORS error on the frame document URL that the walk itself ignores, and a walk to a name no frame answers lands on the daemon's 404 text instead of staying put. Drive the player for anything that walks or carries state; reach for the raw document only when the player's chrome is what's in the way.

For Playwright, wait for DOMContentLoaded and then a meaningful selector from the frame. Do not wait for networkidle: Spool's live reload connection stays open. The local player mounts every frame inside a sandboxed \`<iframe id="spool-player">\`, so its selectors go through \`page.frameLocator("#spool-player")\`. Its first load after an edit compiles every frame of the project behind a "loading" bar, the iframe there but empty: on a large canvas give that first wait a minute, not Playwright's default 30 s. For a portable website use \`page.frameLocator("#website")\`. On a --raw URL the frame is the page, so use top-level locators. The played page is never scaled: its viewport width is capped at the frame's authored w, while its viewport height is the window's available height after local player chrome. Content scrolls within that viewport. Percentage heights and viewport units therefore answer to the actual inner viewport, not frame.json's h. Compare surfaces at equal inner dimensions after fonts and images settle. To use the dependency belonging to this exact Spool install from a repo script, copy the installed-package anchor printed below verbatim:

  import { createRequire } from "node:module";
  const requireFromSpool = createRequire(${JSON.stringify(spoolPackageJson())});
  const { chromium } = requireFromSpool("playwright-core");

  const browser = await chromium.launch({ channel: "chromium-headless-shell" }); // spool's pinned build
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

/** The overview, one topic, or several topics in one text, each under its name; an unknown one refuses them all. */
export function skillText(...asked: string[]): string {
	if (asked.length === 0) return overview();
	const names = [...new Set(asked)];
	const unknown = names.find((name) => !Object.hasOwn(topics, name));
	if (unknown !== undefined) {
		throw new SpoolError(`no skill topic "${unknown}" — topics: ${Object.keys(topics).join(", ")}`);
	}
	const texts = names.map((name) => topics[name]?.() ?? "");
	if (texts.length === 1) return texts[0] ?? "";
	return names.map((name, at) => `--- ${name} ---\n\n${texts[at]}`).join("\n\n");
}
