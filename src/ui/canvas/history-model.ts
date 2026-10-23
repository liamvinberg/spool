import type { HistoryDay, HistoryMovedIn, HistoryStretch } from "../api";

/**
 * How the History pane reads a team project's stretches (spool#187), as #105's paced look draws them: distance is
 * time. The room above a row is the quiet since the stretch above it began, folded by a square root so an afternoon
 * is a breath and not a page; each stretch's mark is as tall as it ran.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;
/** The most room above a row, and the tallest mark. */
const MOST = 44;
/** A quiet this long is said above the row it ends. */
const SAID_QUIET = 30;

const minutes = (ms: number) => Math.max(0, Math.round(ms / MINUTE));

/** `50 min`, `1 h 25 min`, `5 h`. */
function span(total: number): string {
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The room above a row for the quiet since the newer stretch above it began, and the words for a long one. */
export function paceOf(above: HistoryStretch | null, stretch: HistoryStretch): { space: number; quiet: string | null } {
	if (above === null) return { space: 0, quiet: null };
	const gap = minutes(above.start - stretch.end);
	return {
		space: Math.min(MOST, Math.round(Math.sqrt(gap) * 3.2)),
		quiet: gap >= SAID_QUIET ? `${span(gap)} quiet` : null,
	};
}

/** A stretch's mark, as tall as it ran: never under a dot's height nor over the most room a row gets. */
export function markHeight(stretch: HistoryStretch): number {
	return Math.min(MOST, Math.max(9, Math.round(minutes(stretch.end - stretch.start) * 0.4)));
}

export function ranSays(stretch: HistoryStretch): string {
	const ran = minutes(stretch.end - stretch.start);
	return ran === 0 ? "under a minute" : span(ran);
}

/** The file's own name: `order-button.tsx` of `shared/ui/order-button.tsx`. */
export function fileOf(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** The frame a path is in, `checkout/receipt` of `frames/checkout/receipt/frame.tsx`; null outside frames/. */
export function frameOf(path: string): string | null {
	if (!path.startsWith("frames/")) return null;
	const folder = path.slice("frames/".length, path.lastIndexOf("/"));
	return folder === "" ? null : folder;
}

/** What a stretch touched: each frame once, and each file outside the frames by its name. */
export function touchedSays(stretch: HistoryStretch): string {
	const names = [...new Set(stretch.paths.map((path) => frameOf(path) ?? fileOf(path)))];
	return stretch.more > 0 ? `${names.join(", ")} and ${stretch.more} more` : names.join(", ");
}

/** Whether a path is a frame's own, in its folder, rather than a file it imports. */
const ownPath = (path: string, frame: string) => path.startsWith(`frames/${frame}/`);

/** In a frame's history, what reached it through the files it imports: `through order-button.tsx`; null for none. */
export function throughOf(stretch: HistoryStretch, frame: string | null): string | null {
	if (frame === null) return null;
	const through = stretch.paths.filter((path) => !ownPath(path, frame)).map(fileOf);
	return through.length === 0 ? null : `through ${[...new Set(through)].join(" and ")}`;
}

const dateOf = (at: number) =>
	new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** A day's head: `Today · Wed 21 Oct`, `Yesterday · Tue 20 Oct`, or `Sat 17 Oct`. */
export function dayName(day: number, now: number = Date.now()): string {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const ago = Math.round((today.getTime() - day) / DAY);
	return ago === 0 ? `Today · ${dateOf(day)}` : ago === 1 ? `Yesterday · ${dateOf(day)}` : dateOf(day);
}

/** A stretch's end, as the row's left says it: `14:52`. */
export function timeOf(at: number): string {
	return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function savesSays(count: number): string {
	return `${count.toLocaleString("en-US")} ${count === 1 ? "save" : "saves"}`;
}

/** Each day with the stretches the person pick shows, and how many saves they hold: a day showing none folds away. */
export function shownDays(
	days: readonly HistoryDay[],
	person: string | null,
): (HistoryDay & { shown: HistoryStretch[]; saves: number })[] {
	return days.map((day) => {
		const shown = day.stretches.filter((stretch) => person === null || stretch.by.accountId === person);
		return { ...day, shown, saves: shown.reduce((sum, stretch) => sum + stretch.saves, 0) };
	});
}

/** Everyone who saved in these days, once each, in the order they first show: the person pick's choices. */
export function people(days: readonly HistoryDay[]): HistoryStretch["by"][] {
	const found = new Map<string, HistoryStretch["by"]>();
	for (const day of days)
		for (const stretch of day.stretches)
			if (!found.has(stretch.by.accountId)) found.set(stretch.by.accountId, stretch.by);
	return [...found.values()];
}

/** The line that ends a project's history when it moved in from git: the commit's short name once it was told. */
export function movedInSays(movedIn: HistoryMovedIn): string {
	const commit = movedIn.commit === null ? "" : `, in ${movedIn.commit.slice(0, 7)}`;
	return `Moved in from git on ${dateOf(movedIn.at)} by ${movedIn.by.name}${commit}. Older history is in the repo.`;
}
