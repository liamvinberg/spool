import type { Artwork } from "shared/ui/demo/home-data";

/**
 * The world every take on starting a project draws. Ada is signed in, has her own
 * projects and is in one team, Tidemark. A project lives in exactly one place, and
 * the takes differ on when that place gets chosen, not on what the places are.
 *
 *   draft   spool keeps it for you at ~/spool/<name>. Personal, outside any repo.
 *   folder  a design/ inside a folder you chose, usually a git repo beside its code.
 *   team    a Spool Cloud team project. Every member holds real files, which spool
 *           places at ~/spool/<team>/<name>; the cloud relays saves and keeps history.
 *           design/ leaves git on a team project (DEV-112).
 *
 * Moves go one way at a time: a draft can go into a folder or a team, a folder
 * project can go to a team. Nothing here moves a team project back out.
 */

export type PlaceKind = "draft" | "folder" | "team";

export interface Place {
	kind: PlaceKind;
	/** what a person reads: "Drafts", "~/code/tvarso-web", "Tidemark" */
	label: string;
	/** where the files are on this Mac */
	path: string;
	/** git branch when the folder is a repository */
	branch?: string;
}

export interface Project {
	id: string;
	name: string;
	art: Artwork;
	frames: number;
	edited: string;
	place: Place;
	/** team projects only: whether this Mac holds the files yet */
	onMac?: boolean;
	/** team projects only: who is in it right now, by member id */
	here?: string[];
}

export interface Team {
	id: string;
	name: string;
	initial: string;
	hue: string;
	members: string[];
}

export const TEAMS: Team[] = [{ id: "tidemark", name: "Tidemark", initial: "T", hue: "#3E6E86", members: ["ada", "jonas", "mira", "sam"] }];

export const DRAFTS: Place = { kind: "draft", label: "Drafts", path: "~/spool" };

export const PROJECTS: Project[] = [
	{ id: "tvarso", name: "tvärsö", art: "coast", frames: 24, edited: "today", place: { kind: "folder", label: "~/code/tvarso-web", path: "~/code/tvarso-web", branch: "main" } },
	{ id: "kaffe", name: "kaffe", art: "coffee", frames: 18, edited: "yesterday", place: { kind: "draft", label: "Drafts", path: "~/spool/kaffe" } },
	{ id: "fieldnotes", name: "fieldnotes", art: "notes", frames: 12, edited: "2 days ago", place: { kind: "draft", label: "Drafts", path: "~/spool/fieldnotes" } },
	{ id: "tidemark-app", name: "tidemark app", art: "studio", frames: 64, edited: "jonas · now", place: { kind: "team", label: "Tidemark", path: "~/spool/tidemark/tidemark-app" }, onMac: true, here: ["jonas", "mira"] },
	{ id: "onboarding", name: "onboarding", art: "notes", frames: 14, edited: "sam · now", place: { kind: "team", label: "Tidemark", path: "~/spool/tidemark/onboarding" }, onMac: true, here: ["sam"] },
	{ id: "tidemark-site", name: "tidemark site", art: "system", frames: 21, edited: "you · 2 h ago", place: { kind: "team", label: "Tidemark", path: "~/spool/tidemark/tidemark-site" }, onMac: true },
	{ id: "brand-refresh", name: "brand refresh", art: "slack", frames: 9, edited: "sam · 3 days ago", place: { kind: "team", label: "Tidemark", path: "~/spool/tidemark/brand-refresh" }, onMac: false },
	{ id: "dispatch", name: "dispatch", art: "slack", frames: 9, edited: "4 days ago", place: { kind: "folder", label: "~/code/dispatch", path: "~/code/dispatch", branch: "design-pass" } },
];

/**
 * What spool finds when a folder or link is handed to it. Each take answers every
 * one of these: the reading is the same, only how it is presented differs.
 */
export type Finding =
	/** a folder that already holds design/: open it */
	| { kind: "project"; path: string; name: string; frames: number; branch?: string; art: Artwork }
	/** a repository with code and no design/: start one beside the code */
	| { kind: "repo"; path: string; name: string; branch: string; stack: string }
	/** a folder inside a repository that has design/ at its root: spool walks up */
	| { kind: "inside"; path: string; root: string; name: string; frames: number; art: Artwork }
	/** a plain folder, no git, no design/ */
	| { kind: "plain"; path: string; name: string }
	/** a git link: clone it, then read what arrived */
	| { kind: "clone"; url: string; name: string; into: string; frames: number; art: Artwork }
	/** a team project another member made, not on this Mac yet */
	| { kind: "fetch"; name: string; team: string; frames: number; art: Artwork; into: string };

export const FINDINGS: Record<string, Finding> = {
	project: { kind: "project", path: "~/code/harbor", name: "harbor", frames: 31, branch: "main", art: "studio" },
	repo: { kind: "repo", path: "~/code/tidemark-api", name: "tidemark-api", branch: "main", stack: "TypeScript · Hono" },
	inside: { kind: "inside", path: "~/code/tvarso-web/src/routes", root: "~/code/tvarso-web", name: "tvärsö", frames: 24, art: "coast" },
	plain: { kind: "plain", path: "~/Desktop/moodboard", name: "moodboard" },
	clone: { kind: "clone", url: "github.com/mira-k/orbit", name: "orbit", into: "~/code/orbit", frames: 17, art: "system" },
	fetch: { kind: "fetch", name: "brand refresh", team: "Tidemark", frames: 9, art: "slack", into: "~/spool/tidemark/brand-refresh" },
};

/** The name spool gives a project nobody has named yet. */
export const UNTITLED = "untitled";
