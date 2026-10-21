/**
 * History… on a project's tab (spool#187) opens the History pane of a canvas that may not be drawn yet: the tab is
 * focused, and its canvas takes the ask when it mounts, or hears it when it already stands.
 */

const HISTORY_ASKED = "spool-history-asked";
let asked: string | null = null;

/** Opens the project's own history on its canvas, now or once it is drawn. */
export function askProjectHistory(project: string): void {
	asked = project;
	window.dispatchEvent(new CustomEvent(HISTORY_ASKED));
}

/** Listens for the project's history being asked for, taking an ask made before the canvas stood too. */
export function onProjectHistory(project: string, open: () => void): () => void {
	const take = () => {
		if (asked !== project) return;
		asked = null;
		open();
	};
	take();
	window.addEventListener(HISTORY_ASKED, take);
	return () => window.removeEventListener(HISTORY_ASKED, take);
}
