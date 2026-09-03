import type { FsHit, FsListing } from "./api";

/**
 * What the folder picker draws, worked out from what the daemon answered (#251/#277).
 *
 * The picker asks two different questions of the disk — one level while nothing
 * is typed, the tree under the folder you stand in once something is — and both
 * answer as the same row, because the list is one list either way. A browse row
 * lights nothing, because nothing was typed to light. The breadcrumb is the
 * field's own prefix, segment by segment, and `~/` typed in front of a query is
 * the one way past it: every folder under home.
 */

export interface Ask {
	/** `~/` was typed in front: the search is all of home, and the typed `~/` stands in for the breadcrumb */
	readonly wide: boolean;
	/** what is searched for, with the `~/` and the whitespace off */
	readonly term: string;
}

export function askOf(query: string): Ask {
	const wide = query.startsWith("~/");
	return { wide, term: (wide ? query.slice(2) : query).trim() };
}

/** `droneit/spikes` for a folder under the one being searched; nothing for a folder directly in it. */
export function within(path: string, scope: string): string {
	if (path === scope) return "";
	return path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path;
}

export function browseRows(listing: FsListing): readonly FsHit[] {
	return listing.dirs.map((dir) => ({ ...dir, parent: listing.path, matched: [] }));
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
