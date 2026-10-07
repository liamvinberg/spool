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

/** The drawings the fixtures' icon files hold: each is an image a person picked or a repo already had. */
export type IconArt = "spool" | "bag" | "compass" | "bean" | "note" | "grid" | "spark" | "receipt" | "brick";

/**
 * Where a project's icon comes from, first found wins. `file` is the one spool reads by name inside design/, so it
 * travels wherever design/ does; `favicon` is the repo's own, outside design/, so only a Mac with the repo has it.
 * Neither, and the tab draws the name's first letter on a colour picked from the name.
 */
export type ProjectIcon =
	| { readonly from: "file"; readonly path: string; readonly art: IconArt }
	| { readonly from: "favicon"; readonly path: string; readonly art: IconArt };

/** The file "Change icon…" writes and the tab reads: under shared/, because shared/ is what a team project sends. */
export const ICON_FILE = "design/shared/icon.svg";

export interface PlaceTab {
	readonly root: string;
	readonly name: string;
	readonly place: Place;
	readonly icon?: ProjectIcon | undefined;
}

export const TIDEMARK: PlaceTeam = { address: "tidemark", name: "Tidemark" };
export const NORTHLIGHT: PlaceTeam = { address: "northlight", name: "Northlight" };

const file = (art: IconArt): ProjectIcon => ({ from: "file", path: ICON_FILE, art });
const favicon = (art: IconArt, path = "public/favicon.svg"): ProjectIcon => ({ from: "favicon", path, art });

const solo = (name: string, icon?: ProjectIcon): PlaceTab => ({
	root: `~/code/${name.replaceAll(" ", "-")}`,
	name,
	place: { kind: "solo" },
	icon,
});
const team = (name: string, of: PlaceTeam, icon?: ProjectIcon, more: { paused?: string; here?: number } = {}): PlaceTab => ({
	root: `~/code/${of.address}-${name.replaceAll(" ", "-")}`,
	name,
	place: { kind: "team", team: of, ...more },
	icon,
});

export const PAUSED = "this project took 120 saves in the last minute";

/**
 * At rest: three of your own, two Tidemark copies side by side, one Northlight copy. Four have an icon file, notaker
 * has only its repo's favicon, and onboarding has neither.
 */
export const REST: readonly PlaceTab[] = [
	solo("spool", file("spool")),
	team("checkout", TIDEMARK, file("bag"), { here: 2 }),
	team("onboarding", TIDEMARK),
	solo("kaffe", file("bean")),
	solo("notaker v2", favicon("note")),
	team("atlas", NORTHLIGHT, file("compass")),
];

/** One copy paused on a limit, and kvitt ended for this Mac last week: it stays open, as a project here. */
export const TROUBLE: readonly PlaceTab[] = [
	solo("spool", file("spool")),
	team("checkout", TIDEMARK, file("bag"), { here: 2 }),
	team("onboarding", TIDEMARK, undefined, { paused: PAUSED }),
	solo("kaffe", file("bean")),
	{ root: "~/code/kvitt", name: "kvitt", place: { kind: "ended", team: NORTHLIGHT } },
	team("atlas", NORTHLIGHT, file("compass")),
];

/** The same, with the copy that has an icon paused instead: what each icon take does to a pause is the question. */
export const TROUBLE_ICON: readonly PlaceTab[] = TROUBLE.map((tab) =>
	tab.place.kind !== "team" || tab.place.team !== TIDEMARK
		? tab
		: { ...tab, place: { ...tab.place, paused: tab.name === "checkout" ? PAUSED : undefined } },
);

/** Twelve open, more than the strip holds, two of them past the widest a tab gets. */
export const CROWDED: readonly PlaceTab[] = [
	solo("spool", file("spool")),
	solo("competitor study 2026-09-05"),
	team("atlas", NORTHLIGHT, file("compass")),
	team("atlas mobile", NORTHLIGHT),
	team("checkout", TIDEMARK, file("bag"), { here: 2 }),
	team("onboarding", TIDEMARK, undefined, { paused: PAUSED }),
	team("components and interaction patterns", TIDEMARK, file("grid")),
	team("brand refresh", TIDEMARK, file("spark")),
	solo("kaffe", file("bean")),
	solo("notaker v2", favicon("note")),
	solo("kvitt"),
	solo("inwall v2", favicon("brick", "app/icon.png")),
];

/** "Change icon…" on kvitt, a project of your own with no icon yet: before, and after the picked file is copied in. */
export const KVITT_BEFORE: readonly PlaceTab[] = [
	solo("spool", file("spool")),
	team("checkout", TIDEMARK, file("bag"), { here: 2 }),
	solo("kvitt"),
	solo("kaffe", file("bean")),
	solo("notaker v2", favicon("note")),
	team("atlas", NORTHLIGHT, file("compass")),
];
export const KVITT_SET: PlaceTab = { ...solo("kvitt"), icon: file("receipt") };
export const KVITT_AFTER: readonly PlaceTab[] = KVITT_BEFORE.map((tab) => (tab.name === "kvitt" ? KVITT_SET : tab));

/** Home's covers after the change: kvitt, a Tidemark copy, and kaffe. */
export const COVERS = {
	kvitt: KVITT_SET,
	checkout: team("checkout", TIDEMARK, file("bag"), { here: 2 }),
	kaffe: solo("kaffe", file("bean")),
} as const;

/** The three places an icon comes from, one project each. */
export const SOURCES = {
	file: solo("kvitt", file("receipt")),
	favicon: solo("notaker v2", favicon("note")),
	letter: team("onboarding", TIDEMARK),
	letterSolo: solo("competitor study 2026-09-05"),
} as const;
