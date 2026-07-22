import { SpoolError } from "./errors";

/**
 * The in-package skill (#25): `spool skill [topic]` prints it — nothing
 * installs per harness, every install carries its own teacher. This body is
 * the placeholder the verb ships with; the final prose, the completeness
 * contract wording, and the topic set are the skill-text ticket's (#26).
 */

const overview = `spool — live prototyping canvas. Frames are TSX files on disk; the canvas is a projection.

If it isn't in this skill, spool doesn't do it.

The one law: never write app-owned files (design/canvas.json, design/.spool/). Everything else in design/ is yours to author. No locks — parallel sessions stay safe by writing frame folders, never shared registries.

A frame is born by writing design/frames/<name>/frame.tsx default-exporting one React component. No registration, no \`spool new\`. Variants are \`--\`-named siblings (checkout--empty). spool owns the document: pinned React, Tailwind v4 compiled at serve, preflight, shared/tokens.css and fonts injected — write only the component.

Verbs:
  spool init [path]     scaffold design/ and register the project (offline)
  spool open [path]     register an existing project by walk-up (offline)
  spool selection       print what the human points at: path, lines, selector, excerpt
  spool flows           print the link graph: declared from source, walked from sessions
  spool shot <frame>    boot the frame headless, save a screenshot, print its path
  spool logs <frame>    print the boot's console output (cached until source changes)
  spool url <frame>     mint a player-session URL to drive in your own browser
  spool skill [topic]   this text

Topics: frames, flows, scenarios, mock, styling, verbs — \`spool skill frames\`.`;

const topics: Record<string, string> = {
	frames: `design/frames/<name>/frame.tsx default-exports one React component; extra files in the folder may be imported relatively. Shared code lives in design/shared/: ui/ components (kebab-case, no barrels, props only — importing "spool" there fails the compile), lib/utils.ts with cn(). Component state split: useState is what a widget feels, ui.state is what the app knows. Libraries resolve through shared/importmap.json (motion, clsx, cva pinned by init) — no build step, no package.json in design/.`,

	flows: `data-go="<frame-name>" on any element walks there on click (nearest ancestor wins, variants are valid targets). Everything richer: import { ui } from "spool" — ui.go(name, patch) walks with a state patch, ui.back() pops the walk stack, ui.state is the flat shared session state, ui.use() subscribes a component to it. Initialize defensively (ui.state.items ??= [...]) — any frame can start a session. Declared data-go literals draw solid arrows on the canvas; coded walks draw dashed arrows once a real session takes them (spool url, the player, an entered canvas walk).`,

	scenarios: `shared/scenarios/<name>.json is { "state": {...}, "mock": {...} } — state seeds ui.state at session start, mock configures the fake backend. default.json loads on play; the player accepts ?scenario=<name>. Frames never branch on the scenario — loading is felt through mock latency, not flags.`,

	mock: `Relative fetch("/api/x") is intercepted: it returns shared/fixtures/x.json by convention. Scenario mock rules refine per route — "GET /api/x" or "/api/x" keys with { status, fixture, latency, body }; a top-level "latency" number delays every mocked route. Absolute URLs pass through to the real network. Writes are theater: any method gets its canned response; persistence is the frame updating ui.state.`,

	styling: `Tailwind v4, compiled at serve — classes first, real CSS when classes can't say it (<style> one-offs; shared/transitions.css and fonts.css stay plain). Compose classes with cn() from shared/lib/utils.ts, never template-literal class strings. Tokens live in shared/tokens.css alone: :root verbatim for distilled product variables, @theme for spool-born tokens. Motion (the library) is pinned for interaction feel; screen-to-screen motion belongs to the flow layer (crossfade default, morphs via shared view-transition-name, data-transition per-link override, styled in transitions.css).`,

	verbs: `shot and logs are two outputs of one headless boot of your frame in spool's own Chrome, seeded with the default scenario — the CLI runs your frame, never reads the human's canvas. A broken frame exits nonzero with the compile or boot error verbatim on stderr. logs replays its cache while source is unchanged and re-boots on any edit. url prints a player URL; drive it in your own browser and the walks you take appear as dashed arrows on the canvas — verification doubles as flow mapping. selection serves what the human last pointed at (frame or element, with source path and lines). All verbs work from any directory inside the project; the daemon auto-starts.`,
};

export function skillText(topic?: string): string {
	if (topic === undefined) return overview;
	const text = topics[topic];
	if (text === undefined) {
		throw new SpoolError(`no skill topic "${topic}" — topics: ${Object.keys(topics).join(", ")}`);
	}
	return text;
}
