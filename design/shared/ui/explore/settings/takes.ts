import type { SettingsSeed } from "shared/ui/explore/settings/panel";

/**
 * What the row is arguing, said once so the three states never drift apart,
 * and the seed the `--customize` column runs on.
 */

export const SHEET_ARGUES =
	"Sheet. Over the canvas, from a cog at the foot of the right rail, gone on esc, the way the shortcut sheet already works. The project the history row is about is the one standing behind it.";

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
