import agentCover from "../assets/pages/agent.jpg";
import appCover from "../assets/pages/app.jpg";
import bootingCover from "../assets/pages/booting.jpg";
import componentsCover from "../assets/pages/components.jpg";
import directingCover from "../assets/pages/directing.jpg";
import explorerCover from "../assets/pages/explorer.jpg";
import manipulateCover from "../assets/pages/manipulate.jpg";
import pickerCover from "../assets/pages/picker.jpg";
import playInlineCover from "../assets/pages/play-inline.jpg";
import playTabCover from "../assets/pages/play-tab.jpg";
import siteCover from "../assets/pages/site.jpg";
import variantsCover from "../assets/pages/variants.jpg";

/**
 * Spool's own design folder, as it stands: twelve pages, 142 frames, and not one
 * frame on the root page.
 *
 * Which makes this repository the case the empty-page question is about. Open
 * `design/` and the canvas you land on is blank while the rail beside it holds
 * everything. Nothing here is invented: the names and counts are read off
 * `design/frames/`, and each cover is that page's own canvas — its frames at the
 * geometry their sidecars carry, drawn from the stills in `design/.spool/thumbs`.
 * A page's shape is its own: `booting` is twenty frames in one long row and
 * `variants` is a block of lanes, and the covers say so before a word does.
 */

export interface RealPage {
	readonly page: string;
	/** frames under it, its own pages' included — the number the rail carries */
	readonly count: number;
	/** the cover's pixels, which are the page's canvas at its true aspect */
	readonly cw: number;
	readonly ch: number;
	readonly cover: string;
	readonly names: readonly string[];
}

const COVERS: Readonly<Record<string, string>> = {
	agent: agentCover,
	app: appCover,
	booting: bootingCover,
	components: componentsCover,
	directing: directingCover,
	explorer: explorerCover,
	manipulate: manipulateCover,
	picker: pickerCover,
	"play-inline": playInlineCover,
	"play-tab": playTabCover,
	site: siteCover,
	variants: variantsCover,
};

const ROWS: readonly Omit<RealPage, "cover">[] = [
  { page: "agent", count: 27, cw: 560, ch: 317, names: ["agent-chat", "agent-hand", "agent-play", "agent-play--ask-deny", "agent-play--ask-log", "agent-play--edit-run", "agent-play--entered", "agent-play--jump-name", "agent-play--limit-line", "agent-play--limit-stop", "agent-play--mcp-ask", "agent-play--model-menu", "agent-play--plan-pinned", "agent-play--queue-back", "agent-play--queue-box", "agent-play--say-read", "agent-play--shot-open", "agent-play--subagents", "agent-play--threads-strip", "agent-play--wall-install", "agent-play--wall-login", "agent-say-pace", "agent-say-pace--jitter", "agent-stop", "agent-walk-ambient", "agent-walk-ambient--dense", "agent-walk-ambient--off"] },
  { page: "app", count: 7, cw: 560, ch: 428, names: ["spool-canvas", "spool-canvas--find-dim", "spool-canvas--menu", "spool-empty-project", "spool-home", "spool-player", "spool-system"] },
  { page: "booting", count: 20, cw: 560, ch: 24, names: ["ambient--knot", "ambient--reach", "ambient--slack", "ambient--wrap", "boot--ghosts", "boot--line", "boot--thread", "boot--wind", "count--budget", "count--covers", "count--ledger", "count--tally", "handover--carry", "handover--gate", "handover--none", "handover--stall", "shape--beads", "shape--count", "shape--covers", "shape--deal"] },
  { page: "components", count: 4, cw: 560, ch: 76, names: ["spool-components--index", "spool-components--sheet", "spool-components--slots", "spool-components--walk"] },
  { page: "directing", count: 1, cw: 560, ch: 350, names: ["directing--annotate"] },
  { page: "explorer", count: 5, cw: 560, ch: 67, names: ["explorer-rail", "explorer-rail--pages", "explorer-rail--say", "explorer-rail--through", "explorer-rail--unfold"] },
  { page: "manipulate", count: 9, cw: 560, ch: 32, names: ["panel--figma", "panel--grid", "panel--literal", "properties--rail", "select--depth", "select--descend", "select--fallthrough", "select--run", "select--shipped"] },
  { page: "picker", count: 6, cw: 560, ch: 236, names: ["picker", "picker--command", "picker--inline", "picker--projects", "picker--search", "picker--split"] },
  { page: "play-inline", count: 3, cw: 560, ch: 109, names: ["play-inline--lift", "play-inline--settle", "play-inline--zoom"] },
  { page: "play-tab", count: 4, cw: 560, ch: 267, names: ["play-tab--bare", "play-tab--capped", "play-tab--edge", "play-tab--pill"] },
  { page: "site", count: 11, cw: 560, ch: 345, names: ["site-card--pace", "site-disk--write", "site-flows--graph", "site-frames--depth", "site-hub--composed", "site-hub--tutorial", "site-local--blocked", "site-local--found", "site-local--plate", "site-local--wrong", "site-mobile--real"] },
  { page: "variants", count: 45, cw: 486, ch: 560, names: ["axis--matrix", "axis--timeline", "deck--lift", "deck--micro", "deck--tilt", "feel--strip", "files--export", "files--folder", "files--manifest", "files--siblings", "mix--glance", "mix--tray", "peek--diff", "peek--fan", "peek--hold", "peek--label", "peek--strip", "rail--decide", "rail--resolved", "reveal--count", "reveal--deck", "reveal--inspector", "reveal--peek", "reveal--spread", "reveal--strip", "shell--derive", "shell--outlet", "shell--props", "spread--flip", "spread--hold", "spread--overlay", "spread--pair", "throw--dial", "throw--materialize", "throw--morph", "throw--onion", "throw--region", "throw--scroll", "throw--scrub", "throw--tear", "throw--wipe", "tree--chip", "tree--dropdown", "tree--flat", "tree--segment"] },
];

export const REAL_PAGES: readonly RealPage[] = ROWS.map((row) => ({
	...row,
	cover: COVERS[row.page] ?? "",
}));

export const REAL_FRAME_TOTAL = REAL_PAGES.reduce((total, page) => total + page.count, 0);

/** A page's cover scaled to sit inside a box, keeping the shape its canvas has. */
export function fitCover(page: RealPage, maxW: number, maxH: number): { w: number; h: number } {
	const scale = Math.min(maxW / page.cw, maxH / page.ch);
	return { w: Math.round(page.cw * scale), h: Math.round(page.ch * scale) };
}

/* ── the folded set ──────────────────────────────────────────────────── */

import agentTidy from "../assets/tidy/agent.jpg";
import appTidy from "../assets/tidy/app.jpg";
import bootingTidy from "../assets/tidy/booting.jpg";
import componentsTidy from "../assets/tidy/components.jpg";
import directingTidy from "../assets/tidy/directing.jpg";
import explorerTidy from "../assets/tidy/explorer.jpg";
import manipulateTidy from "../assets/tidy/manipulate.jpg";
import pickerTidy from "../assets/tidy/picker.jpg";
import playInlineTidy from "../assets/tidy/play-inline.jpg";
import playTabTidy from "../assets/tidy/play-tab.jpg";
import siteTidy from "../assets/tidy/site.jpg";
import variantsTidy from "../assets/tidy/variants.jpg";

/**
 * The same twelve pages with a very long one folded into bands.
 *
 * `booting` is twenty frames in one row, which is true and unreadable at cover
 * size: 23:1 is a hairline. So a page past 2.6:1 has its frames cut into bands
 * in x order and stacked, which keeps every frame, keeps the reading order, and
 * lands the sheet near 3:2. `bands` is how many it took, and 1 means the cover
 * is the canvas untouched.
 *
 * Five of the twelve needed it. It is the same move a contact sheet makes, and
 * the cost is stated plainly: a folded cover is no longer a picture of where
 * the frames are.
 */
export interface TidyPage extends RealPage {
	readonly bands: number;
}

const TIDY_COVERS: Readonly<Record<string, string>> = {
	agent: agentTidy,
	app: appTidy,
	booting: bootingTidy,
	components: componentsTidy,
	directing: directingTidy,
	explorer: explorerTidy,
	manipulate: manipulateTidy,
	picker: pickerTidy,
	"play-inline": playInlineTidy,
	"play-tab": playTabTidy,
	site: siteTidy,
	variants: variantsTidy,
};

const TIDY_ROWS: readonly { page: string; cw: number; ch: number; bands: number }[] = [
  { page: "agent", cw: 620, ch: 351, bands: 1 },
  { page: "app", cw: 620, ch: 474, bands: 1 },
  { page: "booting", cw: 610, ch: 620, bands: 5 },
  { page: "components", cw: 620, ch: 429, bands: 3 },
  { page: "directing", cw: 620, ch: 388, bands: 1 },
  { page: "explorer", cw: 524, ch: 620, bands: 3 },
  { page: "manipulate", cw: 620, ch: 240, bands: 4 },
  { page: "picker", cw: 620, ch: 261, bands: 1 },
  { page: "play-inline", cw: 620, ch: 442, bands: 2 },
  { page: "play-tab", cw: 620, ch: 295, bands: 1 },
  { page: "site", cw: 620, ch: 382, bands: 1 },
  { page: "variants", cw: 538, ch: 620, bands: 1 },
];

export const TIDY_PAGES: readonly TidyPage[] = TIDY_ROWS.map((row) => {
	const real = REAL_PAGES.find((page) => page.page === row.page);
	return {
		page: row.page,
		count: real?.count ?? 0,
		names: real?.names ?? [],
		cw: row.cw,
		ch: row.ch,
		bands: row.bands,
		cover: TIDY_COVERS[row.page] ?? "",
	};
});
