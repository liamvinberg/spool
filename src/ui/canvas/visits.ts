/**
 * The pages visited, as a browser keeps them (spool#224): ⌘[ goes back one, ⌘]
 * forward again, and going anywhere new voids what was ahead. Only pages, never
 * the camera or what was held: the jump list (jumps.ts) keeps spots, this keeps
 * where in the folders you have been. Per window, in memory, gone on reload.
 */

export interface Visits {
	readonly list: readonly string[];
	readonly at: number;
}

export const VISITS_LIMIT = 100;

export function visitsFrom(page: string): Visits {
	return { list: [page], at: 0 };
}

/** Arriving on a page by any way but back and forward: it becomes the newest, and forward goes. */
export function visit(visits: Visits, page: string): Visits {
	if (visits.list[visits.at] === page) return visits;
	const list = [...visits.list.slice(0, visits.at + 1), page].slice(-VISITS_LIMIT);
	return { list, at: list.length - 1 };
}

/**
 * One step back (-1) or forward (1): the nearest page that way that still
 * stands and is not the one you are on. A page deleted since is stepped over;
 * nothing that way is no step at all.
 */
export function stepVisits(
	visits: Visits,
	by: -1 | 1,
	stands: (page: string) => boolean,
): { visits: Visits; page: string } | undefined {
	const here = visits.list[visits.at];
	for (let at = visits.at + by; at >= 0 && at < visits.list.length; at += by) {
		const page = visits.list[at];
		if (page === undefined || page === here || !stands(page)) continue;
		return { visits: { ...visits, at }, page };
	}
	return undefined;
}

/** Where back and forward go from here, for the path to say while ⌘ is held. */
export function visitsAround(visits: Visits, stands: (page: string) => boolean): { back?: string; forward?: string } {
	const back = stepVisits(visits, -1, stands)?.page;
	const forward = stepVisits(visits, 1, stands)?.page;
	return { ...(back === undefined ? {} : { back }), ...(forward === undefined ? {} : { forward }) };
}
