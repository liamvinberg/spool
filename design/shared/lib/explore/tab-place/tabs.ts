/**
 * The open tabs every take draws, in the person's order. A tab is a root on this Mac, so a team project's tab is
 * always one of its local copies: the place is what `ProjectCard.team` and `ended` say about that root, and a
 * pause is `SyncState.paused`, worded as the daemon words it.
 */

export interface PlaceTeam {
	readonly address: string;
	readonly name: string;
}

export type Place =
	| { readonly kind: "solo" }
	/** a local copy of a team project; `paused` is the daemon's limit, verbatim */
	| { readonly kind: "team"; readonly team: PlaceTeam; readonly paused?: string | undefined; readonly here?: number | undefined }
	/** a copy whose team project ended for this Mac: a solo project now, still saying who it was synced with */
	| { readonly kind: "ended"; readonly team: PlaceTeam };

export interface PlaceTab {
	readonly root: string;
	readonly name: string;
	readonly place: Place;
}

export const TIDEMARK: PlaceTeam = { address: "tidemark", name: "Tidemark" };
export const NORTHLIGHT: PlaceTeam = { address: "northlight", name: "Northlight" };

const solo = (name: string, root = `~/code/${name.replaceAll(" ", "-")}`): PlaceTab => ({ root, name, place: { kind: "solo" } });
const team = (name: string, of: PlaceTeam, more: { paused?: string; here?: number } = {}): PlaceTab => ({
	root: `~/code/${of.address}-${name.replaceAll(" ", "-")}`,
	name,
	place: { kind: "team", team: of, ...more },
});

export const PAUSED = "this project took 120 saves in the last minute";

/** At rest: three of your own, two Tidemark copies side by side, one Northlight copy. */
export const REST: readonly PlaceTab[] = [
	solo("spool"),
	team("checkout", TIDEMARK, { here: 2 }),
	team("onboarding", TIDEMARK),
	solo("kaffe"),
	solo("notaker v2"),
	team("atlas", NORTHLIGHT),
];

/** One copy paused on a limit, and kvitt ended for this Mac last week: it stays open, as a project here. */
export const TROUBLE: readonly PlaceTab[] = [
	solo("spool"),
	team("checkout", TIDEMARK, { here: 2 }),
	team("onboarding", TIDEMARK, { paused: PAUSED }),
	solo("kaffe"),
	{ root: "~/code/kvitt", name: "kvitt", place: { kind: "ended", team: NORTHLIGHT } },
	team("atlas", NORTHLIGHT),
];

/** Twelve open, more than the strip holds, two of them past the widest a tab gets. */
export const CROWDED: readonly PlaceTab[] = [
	solo("spool"),
	solo("competitor study 2026-09-05"),
	team("atlas", NORTHLIGHT),
	team("atlas mobile", NORTHLIGHT),
	team("checkout", TIDEMARK, { here: 2 }),
	team("onboarding", TIDEMARK, { paused: PAUSED }),
	team("components and interaction patterns", TIDEMARK),
	team("brand refresh", TIDEMARK),
	solo("kaffe"),
	solo("notaker v2"),
	solo("kvitt"),
	solo("inwall v2"),
];
