import type { FsHit, FsListing } from "./api";

/** A row the chooser lists: a folder, or with `file` a .spool project file beside them. */
export type FolderRow = FsHit & { file?: true };

/** A browsed folder in the shape a search answers with: its folders, and its .spool files when they are wanted. */
export function browseRows(listing: FsListing, files = false): readonly FolderRow[] {
	const dirs: FolderRow[] = listing.dirs.map((dir) => ({ ...dir, parent: listing.path, matched: [] }));
	if (!files) return dirs;
	return [
		...dirs,
		...listing.spools.map((spool) => ({
			...spool,
			parent: listing.path,
			isProject: false,
			matched: [],
			file: true as const,
		})),
	];
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
