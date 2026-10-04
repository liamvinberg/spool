import { FINDINGS, type Finding, PROJECTS, type Project } from "shared/lib/explore/new-project/places";

/**
 * What the start field reads. Everything here is a reading of the shared world in
 * places.ts: the folders a person can type are the ones FINDINGS names, plus the
 * registered projects' own folders, and listing a folder is what a shell does on
 * Tab, one directory at a time. spool never walks the disk beyond the folder typed.
 */

export type Scope = "own" | "tidemark";
export type Host = "app" | "browser";

/** what one directory holds, as Tab completion lists it */
export const DIRS: Record<string, string[]> = {
	"~": ["code", "Desktop", "spool"],
	"~/code": ["dispatch", "harbor", "tidemark-api", "tvarso-web"],
	"~/code/tvarso-web": ["design", "src"],
	"~/code/tvarso-web/src": ["components", "routes"],
	"~/Desktop": ["moodboard"],
	"~/spool": ["fieldnotes", "kaffe", "tidemark"],
	"~/spool/tidemark": ["brand-refresh", "onboarding", "tidemark-app", "tidemark-site"],
};

export type Reading =
	| { kind: "finding"; finding: Finding }
	/** a folder spool already has: it opens */
	| { kind: "known"; project: Project }
	/** a folder with folders in it and nothing to read yet */
	| { kind: "dir"; path: string };

/** a folder typed in full, read */
export function read(path: string, projects: Project[]): Reading | null {
	const at = trim(path);
	const known = projects.find((project) => project.place.path === at);
	if (known) return { kind: "known", project: known };
	const inside = FINDINGS.inside as Extract<Finding, { kind: "inside" }>;
	if (at === inside.path || at.startsWith(`${inside.root}/`)) {
		return projects.some((project) => project.place.path === inside.root) ? { kind: "finding", finding: { ...inside, path: at } } : null;
	}
	for (const finding of Object.values(FINDINGS)) {
		if ("path" in finding && finding.path === at) return { kind: "finding", finding };
	}
	if (DIRS[at]) return { kind: "dir", path: at };
	return null;
}

/** the folders under the typed parent whose names start with what follows the last slash */
export function complete(path: string): { parent: string; names: string[] } {
	const cut = path.lastIndexOf("/");
	const parent = cut <= 0 ? "~" : path.slice(0, cut);
	const stem = cut < 0 ? "" : path.slice(cut + 1).toLowerCase();
	const names = (DIRS[parent] ?? []).filter((name) => name.toLowerCase().startsWith(stem));
	return { parent, names };
}

export const trim = (path: string) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);

export const isPath = (text: string) => text.startsWith("~") || text.startsWith("/") || text.startsWith("./");

export const isLink = (text: string) => /^(https?:\/\/|git@|ssh:\/\/|github\.com\/|gitlab\.com\/|codeberg\.org\/)/.test(text);

/** a git link, read: the one in FINDINGS, or any other repository named by its last segment */
export function readLink(text: string): Extract<Finding, { kind: "clone" }> {
	const known = FINDINGS.clone as Extract<Finding, { kind: "clone" }>;
	const url = text.replace(/^https?:\/\//, "").replace(/^git@([^:]+):/, "$1/").replace(/\.git$/, "").replace(/\/$/, "");
	if (url === known.url) return known;
	const name = url.split("/").pop() || "repo";
	return { kind: "clone", url, name, into: `~/code/${name}`, frames: 0, art: "blank" };
}

export const PEOPLE = ["jonas", "mira", "sam"];

export const recents = (projects: Project[], scope: Scope) =>
	projects.filter((project) => (scope === "own" ? project.place.kind !== "team" : project.place.kind === "team"));

/** where a project sits, in the words its row prints */
export function placeLabel(project: Project): string {
	if (project.place.kind === "draft") return "drafts";
	if (project.place.kind === "team") return project.onMac === false ? "not on this Mac" : project.place.path;
	return project.place.branch ? `${project.place.path} · ${project.place.branch}` : project.place.path;
}

export const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

export { PROJECTS };
