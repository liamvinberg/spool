/**
 * What a project's icon is, for the frames that draw one (`src/ui/project-icon.tsx`, `src/daemon/project-icon.ts`).
 *
 * The daemon finds the picture: the project's `design/shared/icon.*` (under shared/ because shared/ is what a
 * team project sends), or its repo's favicon, which is outside design/. With neither the name's first letter
 * stands in. The shipped icon is served by the hash of its bytes; a frame has no daemon, so `art` names the
 * drawing the fixture's file would hold.
 */
export type IconArt = "spool" | "bag" | "compass" | "bean" | "note" | "grid" | "spark" | "receipt" | "brick";

export interface ProjectIcon {
	from: "file" | "favicon";
	art: IconArt;
}

/** The tints a letter stands on, brighter than the team hues so a letter never reads as a team. */
const NAME_HUES = ["#5B8DEF", "#D9874E", "#A87BE0", "#4FAF8E", "#D9627A", "#C2A040"];

export function nameHue(name: string): string {
	return NAME_HUES[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % NAME_HUES.length] ?? "#5B8DEF";
}

const file = (art: IconArt): ProjectIcon => ({ from: "file", art });
const favicon = (art: IconArt): ProjectIcon => ({ from: "favicon", art });

/** The fixture projects' icons by name; a name not here has none, and draws its letter. */
export const PROJECT_ICONS: Readonly<Record<string, ProjectIcon>> = {
	spool: file("spool"),
	kaffe: file("bean"),
	checkout: file("bag"),
	"tidemark-app": file("bag"),
	"tidemark-site": file("spark"),
	fieldnotes: file("note"),
	studio: file("grid"),
	"notaker v2": favicon("note"),
	"inwall v2": favicon("brick"),
	kvitt: file("receipt"),
	components: file("grid"),
};

/** The fixture projects that are a local copy of a team's, by name: the team's address. */
export const PROJECT_TEAMS: Readonly<Record<string, string>> = {
	checkout: "tidemark",
	"tidemark-app": "tidemark",
	"tidemark-site": "tidemark",
	mento: "tidemark",
	components: "northlight",
};
