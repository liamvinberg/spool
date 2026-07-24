import type { ComponentType } from "react";

import Landing from "../../landing/frame";
import LandingBlueprint from "../../landing--blueprint/frame";
import LandingDroste from "../../landing--droste/frame";
import LandingSpecimen from "../../landing--specimen/frame";
import LandingSuspension from "../../landing--suspension/frame";
import LandingCanvas from "../../landing-explorations/landing--canvas/frame";
import LandingEditorial from "../../landing-explorations/landing--editorial/frame";
import LandingFlow from "../../landing-explorations/landing--flow/frame";
import LandingFourthwall from "../../landing-explorations/landing--fourthwall/frame";
import LandingFourthwallScroll from "../../landing-explorations/landing--fourthwall-scroll/frame";
import LandingKinetic from "../../landing-explorations/landing--kinetic/frame";
import LandingLivewire from "../../landing-explorations/landing--livewire/frame";
import LandingQuiet from "../../landing-explorations/landing--quiet/frame";
import LandingSelfsource from "../../landing-explorations/landing--selfsource/frame";
import LandingStage from "../../landing-explorations/landing--stage/frame";
import LandingStageFlow from "../../landing-explorations/landing--stage-flow/frame";
import LandingStageLive from "../../landing-explorations/landing--stage-live/frame";
import LandingTerminal from "../../landing-explorations/landing--terminal/frame";
import LandingThread from "../../landing-explorations/landing--thread/frame";
import LandingThreadCenter from "../../landing-explorations/landing--thread-center/frame";
import LandingThreadDense from "../../landing-explorations/landing--thread-dense/frame";
import LandingThreadHeroinstall from "../../landing-explorations/landing--thread-heroinstall/frame";
import LandingThreadRefined from "../../landing-explorations/landing--thread-refined/frame";
import LandingThreadUnspool from "../../landing-explorations/landing--thread-unspool/frame";
import LandingTwohands from "../../landing-explorations/landing--twohands/frame";
import LandingTwohandsYou from "../../landing-explorations/landing--twohands-you/frame";

/**
 * The landings behind spool.page, as data: every real frame, its real size,
 * what it was trying, and which frame it was made from.
 *
 * Each `C` is the real component imported from its real folder, so the hub
 * renders running React at every zoom rather than a picture of it, and `rect`
 * is that frame's own frame.json. Where the frames sit in the hub's field is a
 * separate question, answered by BANDS below.
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The generations the landing actually went through, in order. */
export type Round = 1 | 2 | 3 | 4 | 5;

export const ROUNDS: Record<Round, { label: string; note: string }> = {
	1: { label: "round 01", note: "five directions" },
	2: { label: "round 02", note: "the thread, five ways" },
	3: { label: "graduated", note: "the canonical page" },
	4: { label: "round 03", note: "stunning-first" },
	5: { label: "round 04", note: "the page performs itself" },
};

export interface Draft {
	/** Frame name, exactly as the folder is called on disk. */
	name: string;
	/** Where it sits on the real canvas. */
	rect: Rect;
	/** Which generation it belongs to. */
	round: Round;
	/** One plain line: what this draft was trying. */
	note: string;
	/** The frame this one was made from. Roots have none. */
	parent?: string;
	C: ComponentType;
}

export const DRAFTS: readonly Draft[] = [
	// round 01 — the first five directions, one page each
	{
		name: "landing--thread",
		rect: { x: -320, y: -1446, w: 1440, h: 1489 },
		round: 1,
		note: "röda tråden made literal: one red spine, every section a node",
		C: LandingThread,
	},
	{
		name: "landing--canvas",
		rect: { x: 1336, y: -1446, w: 1440, h: 1620 },
		round: 1,
		note: "the page as an infinite canvas of linked frames",
		C: LandingCanvas,
	},
	{
		name: "landing--editorial",
		rect: { x: 4570, y: 418, w: 1440, h: 1400 },
		round: 1,
		note: "swiss manifesto — type is the whole hero",
		C: LandingEditorial,
	},
	{
		name: "landing--terminal",
		rect: { x: 3030, y: 438, w: 1440, h: 1360 },
		round: 1,
		note: "repo-native: mono does the work, the caret is the only red",
		C: LandingTerminal,
	},
	{
		name: "landing--flow",
		rect: { x: 6181, y: 418, w: 1440, h: 1580 },
		round: 1,
		note: "the walk: a filmstrip of screens with the player beneath",
		C: LandingFlow,
	},

	// round 02 — the thread won, so the thread got pushed five ways
	{
		name: "landing--thread-refined",
		rect: { x: -320, y: 4598, w: 1440, h: 1470 },
		round: 2,
		note: "the same spine, refined — fades at the edges, stitched nodes",
		parent: "landing--thread",
		C: LandingThreadRefined,
	},
	{
		name: "landing--thread-heroinstall",
		rect: { x: 1220, y: 4598, w: 1440, h: 1300 },
		round: 2,
		note: "install inside the hero — for a dev tool the command is the cta",
		parent: "landing--thread-refined",
		C: LandingThreadHeroinstall,
	},
	{
		name: "landing--thread-unspool",
		rect: { x: 2760, y: 4598, w: 1440, h: 1240 },
		round: 2,
		note: "the thread is born at the mark and pays out down the page",
		parent: "landing--thread",
		C: LandingThreadUnspool,
	},
	{
		name: "landing--thread-center",
		rect: { x: 4300, y: 4598, w: 1440, h: 1900 },
		round: 2,
		note: "the spine runs down the middle, stance alternating off it",
		parent: "landing--thread",
		C: LandingThreadCenter,
	},
	{
		name: "landing--thread-dense",
		rect: { x: 5836, y: 4598, w: 1440, h: 800 },
		round: 2,
		note: "the single-screen test: everything, one screen and a bit",
		parent: "landing--thread-unspool",
		C: LandingThreadDense,
	},

	// graduated — the canonical page the whole set was for
	{
		name: "landing",
		rect: { x: -1639, y: 260, w: 1440, h: 1300 },
		round: 3,
		note: "heroinstall's layout, the refined spine, the copy interaction",
		parent: "landing--thread-heroinstall",
		C: Landing,
	},

	// round 03 — the bar moved to stunning-first
	{
		name: "landing--quiet",
		rect: { x: 4576, y: 2232, w: 1440, h: 1400 },
		round: 4,
		note: "the restraint test — a printed manifesto alive in one spot",
		parent: "landing",
		C: LandingQuiet,
	},
	{
		name: "landing--specimen",
		rect: { x: -46, y: 260, w: 1440, h: 1240 },
		round: 4,
		note: "a foundry specimen sheet: every block carries its own spec",
		parent: "landing",
		C: LandingSpecimen,
	},
	{
		name: "landing--blueprint",
		rect: { x: 3074, y: 260, w: 1440, h: 1400 },
		round: 4,
		note: "the landing as its own engineering drawing, dimensioned",
		parent: "landing",
		C: LandingBlueprint,
	},
	{
		name: "landing--kinetic",
		rect: { x: 1456, y: 2232, w: 1440, h: 900 },
		round: 4,
		note: "type cinema — the thread woven through the letterforms",
		parent: "landing",
		C: LandingKinetic,
	},
	{
		name: "landing--livewire",
		rect: { x: 3016, y: 2232, w: 1440, h: 900 },
		round: 4,
		note: "one thread drawn by scroll, tied off at the footer",
		parent: "landing",
		C: LandingLivewire,
	},
	{
		name: "landing--suspension",
		rect: { x: 1514, y: 260, w: 1440, h: 1300 },
		round: 4,
		note: "the statement as a calder mobile, each word on its own thread",
		parent: "landing",
		C: LandingSuspension,
	},
	{
		name: "landing--droste",
		rect: { x: 4634, y: 260, w: 1440, h: 1500 },
		round: 4,
		note: "the page contains itself, seven layers deep, forever",
		parent: "landing",
		C: LandingDroste,
	},
	{
		name: "landing--stage",
		rect: { x: -104, y: 2232, w: 1440, h: 1710 },
		round: 4,
		note: "paper.design's formula — the product shown big and alive",
		parent: "landing",
		C: LandingStage,
	},
	{
		name: "landing--selfsource",
		rect: { x: 1456, y: 772, w: 1440, h: 1000 },
		round: 4,
		note: "a source rail types this page while you watch it appear",
		parent: "landing",
		C: LandingSelfsource,
	},

	// round 04 — the page stops describing the product and performs it
	{
		name: "landing--stage-flow",
		rect: { x: 644, y: 6942, w: 1440, h: 1710 },
		round: 5,
		note: "the stage becomes one real walkable flow: menu, cart, receipt",
		parent: "landing--stage",
		C: LandingStageFlow,
	},
	{
		name: "landing--stage-live",
		rect: { x: 2208, y: 6991, w: 1440, h: 2170 },
		round: 5,
		note: "one scene: the stage is walked, edited and revealed at once",
		parent: "landing--stage-flow",
		C: LandingStageLive,
	},
	{
		name: "landing--twohands",
		rect: { x: 3016, y: -1446, w: 1440, h: 1300 },
		round: 5,
		note: "the finished page, quietly being worked on while you read it",
		parent: "landing",
		C: LandingTwohands,
	},
	{
		name: "landing--twohands-you",
		rect: { x: 5484, y: 6991, w: 1440, h: 1300 },
		round: 5,
		note: "you are the second hand — your cursor inspects the page itself",
		parent: "landing--twohands",
		C: LandingTwohandsYou,
	},
	{
		name: "landing--fourthwall",
		rect: { x: -104, y: 772, w: 1440, h: 900 },
		round: 5,
		note: "click and the whole page drops into one frame on the canvas",
		parent: "landing",
		C: LandingFourthwall,
	},
	{
		name: "landing--fourthwall-scroll",
		rect: { x: 3848, y: 6991, w: 1440, h: 900 },
		round: 5,
		note: "the same reveal, driven by scroll — nobody has to opt in",
		parent: "landing--fourthwall",
		C: LandingFourthwallScroll,
	},
];

/**
 * The descent: the chain of frames this page is actually made of, each one
 * the parent of the next. The röda tråden, at the scale of the process. It is
 * derived from `parent`, not typed twice — walking up from this page.
 */
export const LINEAGE: readonly string[] = (() => {
	const parentOf = new Map<string, string | undefined>([
		...DRAFTS.map((d) => [d.name, d.parent] as const),
		["site-hub--drafts", "landing--fourthwall-scroll"] as const,
	]);
	const chain: string[] = [];
	let at: string | undefined = "site-hub--drafts";
	while (at) {
		chain.unshift(at);
		at = parentOf.get(at);
	}
	return chain;
})();

/** Every frame's parent, drafts, sections and this page alike. */
export const PARENT: Record<string, string | undefined> = {
	...Object.fromEntries(DRAFTS.map((d) => [d.name, d.parent])),
	"site-hub--drafts": "landing--fourthwall-scroll",
};

/* ---------- the field: one generation per band ---------- */

/**
 * The canvas the landing pulls back into is laid out, not found. The frames'
 * real frame.json coordinates are kept above (they are what a frame is, and
 * the focus fly reads its real height from there), but scattering the field at
 * those coordinates read as noise: a visitor cannot see that round 02 came out
 * of round 01 if the two are interleaved across the sheet.
 *
 * So the field is a genealogy. One band per generation, top to bottom in the
 * order they happened, each band centred; every frame shows the same window
 * onto itself (the top 1440x900, the shape of the page it is a draft of) so
 * the bands are directly comparable. The descent is then a straight read down
 * the page, and every parent edge is a short arrow rather than a long one.
 */
const CELL_W = 1440;
const CELL_H = 900;
const GAP_X = 260;
const GAP_Y = 380;

export interface Band {
	label: string;
	note: string;
	names: readonly string[];
}

export const BANDS: readonly Band[] = [
	{
		label: "round 01",
		note: "five directions",
		names: [
			"landing--thread",
			"landing--canvas",
			"landing--editorial",
			"landing--terminal",
			"landing--flow",
		],
	},
	{
		label: "round 02",
		note: "the thread, five ways",
		names: [
			"landing--thread-refined",
			"landing--thread-heroinstall",
			"landing--thread-unspool",
			"landing--thread-center",
			"landing--thread-dense",
		],
	},
	{ label: "graduated", note: "the canonical page", names: ["landing"] },
	{
		label: "round 03",
		note: "stunning-first",
		names: [
			"landing--specimen",
			"landing--quiet",
			"landing--blueprint",
			"landing--suspension",
			"landing--droste",
		],
	},
	{
		label: "",
		note: "",
		names: ["landing--kinetic", "landing--livewire", "landing--selfsource", "landing--stage"],
	},
	{
		label: "round 04",
		note: "the page performs itself",
		names: [
			"landing--twohands",
			"landing--twohands-you",
			"landing--fourthwall",
			"landing--fourthwall-scroll",
			"landing--stage-flow",
			"landing--stage-live",
		],
	},
	{ label: "", note: "", names: ["site-hub--drafts"] },
];

/** Every frame's slot in the genealogy, computed from the bands. */
export const SLOTS: Record<string, Rect> = (() => {
	const out: Record<string, Rect> = {};
	BANDS.forEach((band, row) => {
		const width = band.names.length * CELL_W + (band.names.length - 1) * GAP_X;
		const x0 = -width / 2;
		band.names.forEach((name, col) => {
			out[name] = {
				x: x0 + col * (CELL_W + GAP_X),
				y: row * (CELL_H + GAP_Y),
				w: CELL_W,
				h: CELL_H,
			};
		});
	});
	return out;
})();

/** Where each band's label hangs: the left edge of its first cell. */
export const BAND_ANCHORS = BANDS.map((band, row) => ({
	band,
	x: SLOTS[band.names[0]].x,
	y: row * (CELL_H + GAP_Y),
}));

/** The bounding box of the laid-out field, computed, never hand-typed. */
export const FIELD: Rect = (() => {
	const all = Object.values(SLOTS);
	const x = Math.min(...all.map((r) => r.x));
	const y = Math.min(...all.map((r) => r.y));
	const x1 = Math.max(...all.map((r) => r.x + r.w));
	const y1 = Math.max(...all.map((r) => r.y + r.h));
	return { x, y, w: x1 - x, h: y1 - y };
})();

/** Parent -> child edges, as slots, for the lineage arrows. */
export const EDGES: readonly { from: string; to: string }[] = Object.entries(PARENT)
	.filter(([to, from]) => from !== undefined && SLOTS[to] && SLOTS[from])
	.map(([to, from]) => ({ from: from as string, to }));

/** Where this page itself sits in the genealogy: its own band, near the end. */
export const HUB: Rect = SLOTS["site-hub--drafts"];
