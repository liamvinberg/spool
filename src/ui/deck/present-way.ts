/**
 * How Present plays (spool#298): the slides filling this screen, or the presenter view here with the room on its own
 * screen. Two displays play the presenter view by themselves, always. One display plays the way taken last, full
 * screen the first time; a way taken from the caret's menu, or by ⌥⌘↵, is the one Present takes from then on.
 */

/** `slides`: the slides fill this screen. `presenter`: the presenter view here, and the room in its own window. */
export type PresentWay = "slides" | "presenter";

/** What asked: Present itself (⌘↵), the other way (⌥⌘↵), or a row of the caret's menu. */
export type PresentHow = "present" | "other" | { readonly picked: PresentWay };

export interface PresentPlan {
	readonly way: PresentWay;
	/** the room's window opens: on its own screen, or beside spool's as a window to share */
	readonly room: boolean;
	/** the way Present takes from now on, when this changed it */
	readonly remember?: PresentWay;
}

export const otherWay = (way: PresentWay): PresentWay => (way === "slides" ? "presenter" : "slides");

/** The way Present takes on these displays: the presenter view on two, the way remembered on one. */
export const wayPresentTakes = (displays: 1 | 2, remembered: PresentWay): PresentWay =>
	displays === 2 ? "presenter" : remembered;

export function presentPlan({
	displays,
	remembered,
	how,
}: {
	displays: 1 | 2;
	remembered: PresentWay;
	how: PresentHow;
}): PresentPlan {
	const takes = wayPresentTakes(displays, remembered);
	const way = how === "present" ? takes : how === "other" ? otherWay(takes) : how.picked;
	// with two displays, full screen is the slides on both screens: here, and the room on the other
	const room = way === "presenter" || displays === 2;
	const chosen = how !== "present" && displays === 1 && way !== remembered;
	return chosen ? { way, room, remember: way } : { way, room };
}
