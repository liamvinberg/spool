import type { SettingsSeed } from "shared/ui/explore/settings/panel";

/**
 * What each row is arguing, said once so the three states of a take never drift
 * apart, and the seed the `--customize` column runs on.
 */

export const SHEET_ARGUES =
	"Sheet. Over the canvas, out of the canvas menu, gone on esc, the way the shortcut sheet already works. The project the history row is about is the one standing behind it.";

export const HOME_ARGUES =
	"Home. The install’s own screen grows a second row, so settings sit where the project list does. No canvas is open here, so the history row has to name a project: the band carries a picker over the registered roots.";

export const WINDOW_ARGUES =
	"Window. Standard Mac placement, ⌘, out of the app menu, spool’s chrome inside the OS’s frame. A browser tab has no app menu, so this take is paired with one of the other two rather than replacing it.";

/**
 * One token mid-edit: `thread` typed over with the blue a development daemon
 * already paints its mark, the caret still in the field. Everything the accent
 * touches changes with it, which is the whole reason the token list is worth
 * having.
 */
export const EDITED: SettingsSeed = {
	tab: "theme",
	customize: true,
	colours: { thread: "#2f6fe0" },
	editing: "thread",
};
