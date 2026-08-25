import type { FsHit, FsListing, ProjectCard } from "./api";

/**
 * What the folder picker draws, worked out from what the daemon answered (#251).
 *
 * The picker asks two different questions of the disk — one level while nothing
 * is typed, the whole tree under home once something is — and both answer as the
 * same row, because the list is one list either way. A browse row lights nothing,
 * because nothing was typed to light.
 */

export function browseRows(listing: FsListing): readonly FsHit[] {
	return listing.dirs.map((dir) => ({ ...dir, parent: listing.path, matched: [] }));
}

export interface RowGroup {
	readonly label: string;
	readonly rows: readonly FsHit[];
	/** where this group's first row sits in the flat list the keyboard moves through */
	readonly from: number;
}

/**
 * Results in two groups, because they answer two different sentences. A folder
 * with a `canvas.json` is somewhere spool can open; every other folder is
 * somewhere to go, or somewhere to run init. Ranking them in one column put
 * `gym-brute-sketch` above the project it was sketched from.
 *
 * Browsing is one group and no header: the folder you are standing in is
 * already named in the breadcrumb above.
 */
export function groupRows(rows: readonly FsHit[], searching: boolean): readonly RowGroup[] {
	if (!searching) return rows.length === 0 ? [] : [{ label: "", rows, from: 0 }];
	const projects = rows.filter((row) => row.isProject);
	const folders = rows.filter((row) => !row.isProject);
	return [
		{ label: "spool projects", rows: projects, from: 0 },
		{ label: "folders", rows: folders, from: projects.length },
	].filter((group) => group.rows.length > 0);
}

/** `~/personal/projects` — the only form a path under home is ever printed in. */
export function shortPath(path: string, home: string): string {
	if (path === home) return "~";
	return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

export interface Crumb {
	readonly label: string;
	readonly path: string;
}

/**
 * The breadcrumb, segment by segment: how you get back up two levels at once.
 * Home prints as `~` and everything below it hangs off that, but the browse can
 * still walk above home the way it always could, and up there the crumbs are
 * just the path from the root.
 */
export function crumbsOf(path: string, home: string): readonly Crumb[] {
	const short = shortPath(path, home);
	if (short.startsWith("~")) {
		const parts = short.split("/");
		return parts.map((label, index) => ({
			label,
			path: index === 0 ? home : `${home}/${parts.slice(1, index + 1).join("/")}`,
		}));
	}
	const parts = path.split("/").filter((part) => part !== "");
	return [
		{ label: "/", path: "/" },
		...parts.map((label, index) => ({ label, path: `/${parts.slice(0, index + 1).join("/")}` })),
	];
}

export interface JumpTarget {
	readonly label: string;
	readonly path: string;
}

/**
 * The folders spool already knows projects live in, most-populated first. Not a
 * guess about the disk: it is the registry read back as places, which is the one
 * thing a fresh browse cannot tell you.
 */
export function jumpTargets(projects: readonly ProjectCard[], home: string): readonly JumpTarget[] {
	const seen = new Map<string, number>();
	for (const project of projects) {
		const parent = project.root.slice(0, project.root.lastIndexOf("/"));
		if (parent === "" || parent === home || !parent.startsWith(`${home}/`)) continue;
		seen.set(parent, (seen.get(parent) ?? 0) + 1);
	}
	return [
		{ label: "~", path: home },
		...[...seen.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([path]) => ({ label: shortPath(path, home), path })),
	];
}
