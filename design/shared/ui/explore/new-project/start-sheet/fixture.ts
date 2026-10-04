import { FINDINGS, type Finding, PROJECTS, type Project } from "shared/lib/explore/new-project/places";

/**
 * Ada's disk, as far as a folder chooser can see it. spool never walks this: it
 * reads one folder when somebody hands it one, and lists one folder at a time in
 * its own browser (a web page has no Finder to ask).
 */
export const DISK: Record<string, string[]> = {
	"~": ["code", "Desktop", "Documents", "Downloads", "spool"],
	"~/code": ["dispatch", "harbor", "tidemark-api", "tvarso-web"],
	"~/code/dispatch": ["design", "src"],
	"~/code/dispatch/design": [],
	"~/code/dispatch/src": [],
	"~/code/harbor": ["design", "public", "src"],
	"~/code/harbor/design": [],
	"~/code/harbor/public": [],
	"~/code/harbor/src": [],
	"~/code/tidemark-api": ["src", "test"],
	"~/code/tidemark-api/src": [],
	"~/code/tidemark-api/test": [],
	"~/code/tvarso-web": ["design", "public", "src"],
	"~/code/tvarso-web/design": [],
	"~/code/tvarso-web/public": [],
	"~/code/tvarso-web/src": ["components", "routes"],
	"~/code/tvarso-web/src/components": [],
	"~/code/tvarso-web/src/routes": [],
	"~/Desktop": ["moodboard", "screenshots"],
	"~/Desktop/moodboard": [],
	"~/Desktop/screenshots": [],
	"~/Documents": ["invoices", "notes"],
	"~/Documents/invoices": [],
	"~/Documents/notes": [],
	"~/Downloads": [],
	"~/spool": ["fieldnotes", "kaffe", "tidemark"],
	"~/spool/fieldnotes": ["frames", "shared"],
	"~/spool/fieldnotes/frames": [],
	"~/spool/fieldnotes/shared": [],
	"~/spool/kaffe": ["frames", "shared"],
	"~/spool/kaffe/frames": [],
	"~/spool/kaffe/shared": [],
	"~/spool/tidemark": ["onboarding", "tidemark-app", "tidemark-site"],
	"~/spool/tidemark/onboarding": [],
	"~/spool/tidemark/tidemark-app": [],
	"~/spool/tidemark/tidemark-site": [],
};

/** What a row in a chooser says about a folder before anyone picks it. */
export const MARKS: Record<string, string> = {
	"~/code/dispatch": "git",
	"~/code/harbor": "git",
	"~/code/tidemark-api": "git",
	"~/code/tvarso-web": "git",
};

type Of<K extends Finding["kind"]> = Extract<Finding, { kind: K }>;
export const HARBOR = FINDINGS.project as Of<"project">;
export const REPO = FINDINGS.repo as Of<"repo">;
export const INSIDE = FINDINGS.inside as Of<"inside">;
export const PLAIN = FINDINGS.plain as Of<"plain">;
export const CLONE = FINDINGS.clone as Of<"clone">;
export const FETCH = FINDINGS.fetch as Of<"fetch">;

/** What the Mac app finds on the clipboard when Open… comes up. */
export const CLIPBOARD = "github.com/mira-k/orbit";

/** Ada's own projects, the ones on her Home before anything happens. */
export const OWN: Project[] = PROJECTS.filter((project) => project.place.kind !== "team");
export const TEAM_PROJECTS: Project[] = PROJECTS.filter((project) => project.place.kind === "team");

/**
 * The reading spool makes of what it was handed. Every FINDINGS kind, plus the two
 * a real reading also meets: a folder spool already knows, and nothing there.
 */
export type Reading = Finding | { kind: "known"; path: string; project: Project } | { kind: "missing"; path: string };

export function tidy(raw: string): string {
	let value = raw.trim().replace(/\/+$/, "");
	value = value.replace(/^\/Users\/ada(?=\/|$)/, "~");
	if (value === "") return "";
	return value;
}

export function isLink(value: string): boolean {
	return /^(https?:\/\/|git@|github\.com\/|gitlab\.com\/)/.test(value);
}

export function read(raw: string, projects: Project[]): Reading {
	const value = tidy(raw);
	if (isLink(value)) {
		const url = value.replace(/^https?:\/\//, "").replace(/^git@([^:]+):/, "$1/").replace(/\.git$/, "");
		if (url === CLONE.url) return CLONE;
		const name = url.split("/").pop() || "repository";
		return { kind: "clone", url, name, into: `~/code/${name}`, frames: 0, art: "blank" };
	}
	const known = projects.find((project) => project.place.kind !== "team" && project.place.path === value);
	if (known) return { kind: "known", path: value, project: known };
	if (!(value in DISK)) return { kind: "missing", path: value };
	const harbor = HARBOR;
	if (value === harbor.path) return harbor;
	if (value === REPO.path) return REPO;
	// a folder below a project's root: spool walks up to the design/ it belongs to
	const root = projects.find((project) => project.place.kind === "folder" && value.startsWith(`${project.place.path}/`));
	if (root) return { kind: "inside", path: value, root: root.place.path, name: root.name, frames: root.frames, art: root.art };
	if (value.startsWith(`${harbor.path}/`)) return { kind: "inside", path: value, root: harbor.path, name: harbor.name, frames: harbor.frames, art: harbor.art };
	if (value.startsWith("~/spool/")) {
		const draft = projects.find((project) => value.startsWith(`${project.place.path}/`));
		if (draft) return { kind: "known", path: value, project: draft };
	}
	return { kind: "plain", path: value, name: value.split("/").pop() || value };
}

export const nameOf = (path: string): string => path.split("/").pop() || path;

export function isSafeName(name: string): boolean {
	return name.length > 0 && !name.startsWith(".") && !/[/\\]/.test(name);
}
