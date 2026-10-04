import type { Artwork } from "shared/ui/demo/home-data";
import { DRAFTS, FINDINGS, type Finding, type Place, PROJECTS, TEAMS, UNTITLED } from "shared/lib/explore/new-project/places";

/**
 * What the start-drafts take adds to the shared world: the order Home lists things
 * in, the folders the Open… list can show, and the frames a fetched team project
 * arrives with. Everything else is read from places.ts.
 */

export type Section = "recents" | "drafts" | "folders" | "tidemark";

export interface Item {
	id: string;
	name: string;
	art: Artwork | null;
	frames: number;
	edited: string;
	place: Place;
	onMac: boolean;
	here: string[];
	/** what spool read when the folder was handed to it, shown once on the card it landed as */
	reading?: string | undefined;
	/** a clone or a fetch still arriving */
	arriving?: boolean | undefined;
}

export const TEAM = TEAMS[0]!;

export const initialItems = (): Item[] =>
	PROJECTS.map((project) => ({
		id: project.id,
		name: project.name,
		art: project.art,
		frames: project.frames,
		edited: project.edited,
		place: project.place,
		onMac: project.onMac ?? true,
		here: project.here ?? [],
	}));

/** The path a project's design/ sits at, which is what an agent is pointed at. */
export function designPath(item: Pick<Item, "name" | "place">): string {
	const slug = slugOf(item.name);
	if (item.place.kind === "draft") return `${DRAFTS.path}/${slug}`;
	if (item.place.kind === "team") return `~/spool/${TEAM.id}/${slug}`;
	return `${item.place.path}/design`;
}

export const slugOf = (name: string) => name.trim().replace(/\s+/g, "-");

export function draftPlace(name: string): Place {
	return { kind: "draft", label: DRAFTS.label, path: `${DRAFTS.path}/${slugOf(name)}` };
}

export function teamPlace(name: string): Place {
	return { kind: "team", label: TEAM.name, path: `~/spool/${TEAM.id}/${slugOf(name)}` };
}

/** The next free "untitled", the way Finder numbers a second new folder. */
export function nextUntitled(items: Item[]): string {
	const taken = new Set(items.map((item) => item.name));
	if (!taken.has(UNTITLED)) return UNTITLED;
	let n = 2;
	while (taken.has(`${UNTITLED} ${n}`)) n += 1;
	return `${UNTITLED} ${n}`;
}

/* ── Open… ─────────────────────────────────────────────────── */

/**
 * One row of the Open… list. The daemon lists the folder the field names, the
 * same read the shipped picker makes; spool reads each child it shows and says
 * what it found before anything is registered.
 */
export interface Spot {
	key: string;
	path: string;
	name: string;
	/** what spool found there, or the registered project it already is */
	finding: Finding | { kind: "known"; id: string; name: string; path: string };
}

const CODE: Spot[] = [
	{ key: "dispatch", path: "~/code/dispatch", name: "dispatch", finding: { kind: "known", id: "dispatch", name: "dispatch", path: "~/code/dispatch" } },
	{ key: "harbor", path: "~/code/harbor", name: "harbor", finding: FINDINGS.project! },
	{ key: "tidemark-api", path: "~/code/tidemark-api", name: "tidemark-api", finding: FINDINGS.repo! },
	{ key: "tvarso-web", path: "~/code/tvarso-web", name: "tvarso-web", finding: { kind: "known", id: "tvarso", name: "tvärsö", path: "~/code/tvarso-web" } },
];

const DESKTOP: Spot[] = [{ key: "moodboard", path: "~/Desktop/moodboard", name: "moodboard", finding: FINDINGS.plain! }];

const ROUTES: Spot = { key: "routes", path: "~/code/tvarso-web/src/routes", name: "routes", finding: FINDINGS.inside! };
const ORBIT: Spot = { key: "orbit", path: "github.com/mira-k/orbit", name: "orbit", finding: FINDINGS.clone! };

/** What the list shows for what the field says: a folder's children, a folder spool walks up from, or a link. */
export function spotsFor(query: string): { listing: string; spots: Spot[] } {
	const q = query.trim();
	if (/github\.com|gitlab\.com|^git@|^https?:\/\//.test(q)) return { listing: "git link", spots: [ORBIT] };
	if (q.startsWith("~/code/tvarso-web/")) return { listing: "~/code/tvarso-web/src", spots: [ROUTES] };
	const desktop = q.startsWith("~/Desktop");
	const parent = desktop ? "~/Desktop/" : "~/code/";
	const rest = q.startsWith(parent) ? q.slice(parent.length).toLowerCase() : q.replace(/^~\/?/, "").toLowerCase();
	const pool = desktop ? DESKTOP : CODE;
	return { listing: parent.slice(0, -1), spots: pool.filter((spot) => spot.name.toLowerCase().startsWith(rest)) };
}

/** The finding as a line of machine text: what spool will say on the card. */
export function readingOf(finding: Spot["finding"]): string {
	switch (finding.kind) {
		case "known":
			return "in spool";
		case "project":
			return `design/ · ${finding.frames} frames${finding.branch ? ` · ${finding.branch}` : ""}`;
		case "repo":
			return `git · ${finding.branch} · no design/`;
		case "inside":
			return `inside ${finding.root.split("/").pop()}`;
		case "plain":
			return "plain folder · no git";
		case "clone":
			return `clone · ${finding.frames} frames`;
		case "fetch":
			return `${finding.team} · ${finding.frames} frames`;
	}
}

/** What Enter does to that row, as the button says it. */
export function verbOf(finding: Spot["finding"]): string {
	switch (finding.kind) {
		case "known":
			return "Go to it";
		case "project":
			return "Open";
		case "repo":
			return "Start design/ here";
		case "inside":
			return "Go to tvärsö";
		case "plain":
			return "Start design/ here";
		case "clone":
			return "Clone and open";
		case "fetch":
			return "Fetch";
	}
}

/** The longer reading, a sentence a person says, for the row under the cursor. */
export function sentenceOf(finding: Spot["finding"]): string {
	switch (finding.kind) {
		case "known":
			return `${finding.name} is already in spool.`;
		case "project":
			return `A spool project with ${finding.frames} frames on ${finding.branch ?? "no branch"}. spool registers it and lists it under Folders.`;
		case "repo":
			return `A ${finding.stack} repository with no design/ yet. spool starts one at its root, beside the code.`;
		case "inside":
			return `This folder sits inside ${finding.root}, which already holds tvärsö. spool walks up to it.`;
		case "plain":
			return "No git and no design/. spool starts design/ inside it, and nothing keeps its history until you add git.";
		case "clone":
			return `spool clones it into ${finding.into} and opens the ${finding.frames} frames it finds.`;
		case "fetch":
			return `${finding.name} is a ${finding.team} project. spool fetches it to ${finding.into}.`;
	}
}

/* ── a dropped folder ──────────────────────────────────────── */

/**
 * The Mac app gets a dropped folder's path from Electron. A browser gives the
 * folder's name and lets spool read inside it, never where it is, so spool tries
 * that name beside the folders it already knows (~/code/tvarso-web and
 * ~/code/dispatch put ~/code on the list) and asks only when nothing answers.
 */
export const KNOWN_PARENTS = ["~/code"];

export function droppedNamed(name: string): Spot {
	const hit = [...CODE, ...DESKTOP].find((spot) => spot.name === name);
	return hit ?? { key: name, path: `~/Desktop/${name}`, name, finding: { kind: "plain", path: `~/Desktop/${name}`, name } };
}

export const HARBOR = CODE[1]!;

/* ── a fetched team project ────────────────────────────────── */

export interface BrandFrame {
	name: string;
	look: "mark" | "palette" | "type" | "buttons" | "card" | "post" | "email" | "deck" | "sign";
}

export const BRAND_FRAMES: BrandFrame[] = [
	{ name: "mark", look: "mark" },
	{ name: "palette", look: "palette" },
	{ name: "type", look: "type" },
	{ name: "buttons", look: "buttons" },
	{ name: "card", look: "card" },
	{ name: "post", look: "post" },
	{ name: "email", look: "email" },
	{ name: "deck", look: "deck" },
	{ name: "signage", look: "sign" },
];
