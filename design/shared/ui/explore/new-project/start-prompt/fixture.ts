import { DRAFTS, FINDINGS, type Finding, type Place, PROJECTS, type Project, TEAMS } from "shared/lib/explore/new-project/places";

/**
 * What start-prompt adds to the shared world: the ask Ada types, the name her agent
 * gives it, the folders a chooser or a typed path can reach, and the turn the agent
 * plays once the project exists. Everything a folder turns out to be comes from
 * FINDINGS; this file only says which path leads to which finding.
 */

export const TIDEMARK = TEAMS[0]!;

/** the ask on the --asking frame, and what the agent calls the project it starts */
export const ASK = "A tide planner for sea kayakers: pick a spot, see the next safe window, get a nudge before it closes.";
export const ASK_NAME = "tide windows";

export const OWN = PROJECTS.filter((project) => project.place.kind !== "team");
export const TEAM = PROJECTS.filter((project) => project.place.kind === "team");

export const teamPlace = (name: string): Place => ({ kind: "team", label: TIDEMARK.name, path: `~/spool/tidemark/${slug(name)}` });
export const draftPlace = (name: string): Place => ({ kind: "draft", label: DRAFTS.label, path: `~/spool/${slug(name)}` });
export const folderPlace = (root: string, branch?: string): Place => ({ kind: "folder", label: root, path: `${root}/design`, ...(branch ? { branch } : {}) });

export function slug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9äöå]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

/**
 * The name an agent would give an ask. The real one is the agent's own first call;
 * this stands in for it with the ask's first few content words.
 */
export function nameFor(ask: string): string {
	if (ask.trim() === ASK) return ASK_NAME;
	const words = ask
		.toLowerCase()
		.replace(/[^a-z0-9äöå\s-]/g, " ")
		.split(/\s+/)
		.filter((word) => word !== "" && !["a", "an", "the", "for", "of", "with", "and", "make", "me", "some", "to"].includes(word));
	return words.slice(0, 2).join(" ") || "untitled";
}

/* ── the folders a chooser or a typed path can reach ────────── */

/**
 * The directories the daemon lists when a path is typed. Listing the one folder
 * somebody named is not a scan: it is the shipped picker's `browseDirectory`, and it
 * is what lets a browser, which has no folder dialog, still hand spool a path.
 */
export const LISTINGS: Record<string, string[]> = {
	"~": ["code", "Desktop", "Documents", "spool"],
	"~/code": ["dispatch", "harbor", "tidemark-api", "tvarso-web"],
	"~/code/tvarso-web": ["design", "public", "src"],
	"~/code/tvarso-web/src": ["lib", "routes"],
	"~/Desktop": ["moodboard", "screenshots"],
	"~/Documents": ["invoices"],
	"~/spool": ["fieldnotes", "kaffe", "tidemark"],
};

/** a registered project's root, so handing spool a folder it already knows just opens the tab */
export const KNOWN: Record<string, string> = {
	"~/code/tvarso-web": "tvarso",
	"~/code/dispatch": "dispatch",
	"~/spool/kaffe": "kaffe",
	"~/spool/fieldnotes": "fieldnotes",
};

/** what spool reads at a path: one of the shared findings, or a plain folder named after itself */
export function readPath(path: string): Finding | { kind: "known"; id: string; path: string } {
	const clean = path.replace(/\/+$/, "");
	const known = KNOWN[clean];
	if (known !== undefined) return { kind: "known", id: known, path: clean };
	for (const finding of Object.values(FINDINGS)) {
		if ("path" in finding && finding.path === clean) return finding;
	}
	if (clean.startsWith("~/code/tvarso-web/")) return { ...FINDINGS.inside!, path: clean } as Finding;
	const name = clean.split("/").pop() ?? clean;
	return { kind: "plain", path: clean, name };
}

/** the folders the chooser shows, in its own sidebar groups */
export const CHOOSER: { place: string; rows: { name: string; path: string; note: string }[] }[] = [
	{
		place: "code",
		rows: [
			{ name: "dispatch", path: "~/code/dispatch", note: "Today" },
			{ name: "harbor", path: "~/code/harbor", note: "Yesterday" },
			{ name: "tidemark-api", path: "~/code/tidemark-api", note: "Today" },
			{ name: "tvarso-web", path: "~/code/tvarso-web", note: "2 days ago" },
		],
	},
	{
		place: "Desktop",
		rows: [
			{ name: "moodboard", path: "~/Desktop/moodboard", note: "Last week" },
			{ name: "screenshots", path: "~/Desktop/screenshots", note: "Today" },
		],
	},
];

export const GIT_LINK = /^(https?:\/\/)?(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+\/?$/i;
export const PATHISH = /^(~\/|~$|\/)/;

/* ── the turn ───────────────────────────────────────────────── */

export type RowState = "pending" | "running" | "done";

export interface Beat {
	/** ms after Enter */
	at: number;
	/** ms the row runs before it settles; 0 for rows that land settled */
	runs: number;
	kind: "think" | "tool" | "say";
	tool?: string;
	label: string;
	meta?: string;
	/** the frame this write makes */
	frame?: string;
	/** the agent's first call: the project takes this name when the row settles */
	names?: boolean;
}

export const FRAMES = ["spot", "window", "nudge"] as const;
export type FrameName = (typeof FRAMES)[number];

export function beatsFor(name: string): Beat[] {
	return [
		{ at: 200, runs: 900, kind: "think", label: "thinking" },
		{ at: 1100, runs: 500, kind: "tool", tool: "name", label: name, names: true },
		{ at: 1700, runs: 1100, kind: "tool", tool: "write", label: "frames/app/spot/frame.tsx", meta: "+92", frame: "spot" },
		{ at: 2600, runs: 1200, kind: "tool", tool: "write", label: "frames/app/window/frame.tsx", meta: "+118", frame: "window" },
		{ at: 3600, runs: 1000, kind: "tool", tool: "write", label: "frames/app/nudge/frame.tsx", meta: "+64", frame: "nudge" },
		{ at: 4800, runs: 600, kind: "tool", tool: "shot", label: "app/window" },
		{
			at: 5600,
			runs: 0,
			kind: "say",
			label: "Three frames on app: spot, window and nudge. The tide table is one I made up, so tell me where you paddle and window will read your spots.",
		},
	];
}

/** when the turn is over and spool renames the folder to follow the name */
export const TURN_END = 6900;

export type Opened = { kind: "draft" | "team" | "folder"; place: Place };

export function findingTitle(finding: Finding): string {
	return finding.kind === "clone" ? finding.url : finding.name;
}

export const projectById = (id: string): Project | undefined => PROJECTS.find((project) => project.id === id);
