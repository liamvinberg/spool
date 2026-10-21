import type { HistoryRestore, HistoryScope, HistoryStretch, RestoreAsk, RestoreKind } from "../api";
import { fileOf, frameOf, timeOf } from "./history-model";

/**
 * How the History pane says a restore (spool#188), as #105's prototype words it: what an open stretch can put back,
 * the one question asked first, a frame's changed shared file offered beside it, and the row and toast a restore
 * makes. A restore goes back to a stretch's end; undoing one is a restore of the same paths to just before it.
 */

const DAY = 86_400_000;

/** What a restore puts back: a file by its path, a frame by its name, a page by its path, or the whole project. */
export interface RestoreTarget {
	kind: RestoreKind;
	target: string;
}

/** `frame.tsx`, `cart`, `the checkout page`, `the whole project`. */
export function targetSays({ kind, target }: RestoreTarget): string {
	if (kind === "file") return fileOf(target);
	if (kind === "frame") return fileOf(target);
	if (kind === "page") return `the ${target === "" ? "root" : target} page`;
	return "the whole project";
}

/** A moment as the question names it: `14:52 today`, `14:52 yesterday`, `09:05 Sat 17 Oct`. */
export function momentSays(at: number, now: number = Date.now()): string {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const day = new Date(at);
	day.setHours(0, 0, 0, 0);
	const ago = Math.round((today.getTime() - day.getTime()) / DAY);
	const said =
		ago === 0
			? "today"
			: ago === 1
				? "yesterday"
				: new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
	return `${timeOf(at)} ${said}`;
}

/** The page a frame stands on: its name's parent, "" for the root page. */
const pageOf = (frame: string) => (frame.includes("/") ? frame.slice(0, frame.lastIndexOf("/")) : "");

/**
 * What Restore… offers under an open stretch: in a frame's history that frame; in the project's, each frame and each
 * page the stretch touched, then the whole project.
 */
export function restoreTargets(stretch: HistoryStretch, scope: HistoryScope): RestoreTarget[] {
	if (scope.kind === "frame") return [{ kind: "frame", target: scope.frame }];
	const frames = new Set<string>();
	const pages = new Set<string>();
	for (const path of stretch.paths) {
		const frame = frameOf(path);
		if (frame === null) continue;
		frames.add(frame);
		pages.add(pageOf(frame));
	}
	return [
		...[...frames].sort().map((target): RestoreTarget => ({ kind: "frame", target })),
		...[...pages].sort().map((target): RestoreTarget => ({ kind: "page", target })),
		{ kind: "project", target: "" },
	];
}

/** The one question a restore asks: what goes back, to when, and that it is new saves anyone can undo. */
export function questionSays(
	target: RestoreTarget,
	moment: number,
	files: number,
	by: string,
	now: number = Date.now(),
): { title: string; description: string } {
	const one = files === 1;
	return {
		title: `Restore ${targetSays(target)} to ${momentSays(moment, now)}?`,
		description: `${files.toLocaleString("en-US")} ${one ? "file goes" : "files go"} back to how ${one ? "it" : "they"} stood after ${by}'s saves ended. It reaches the team as new saves, so the history keeps today's version and the restore can be undone.`,
	};
}

/** `a, b and c`. */
function listOf(names: readonly string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Under a shared file offered beside a frame: why, and which other frames it would change. */
export function sharedSays(frame: string, others: readonly string[]): string {
	const why = `${fileOf(frame)} imports it and it changed since.`;
	if (others.length === 0) return why;
	return `${why} ${listOf(others.map(fileOf))} ${others.length === 1 ? "uses" : "use"} it too.`;
}

/** What a restore put back, to when: `cart to 14:52 today`. */
export function restoredSays(restore: Pick<HistoryRestore, "kind" | "target" | "toAt">, now: number = Date.now()) {
	const what = targetSays(restore);
	return restore.toAt === null ? what : `${what} to ${momentSays(restore.toAt, now)}`;
}

/** The restore that undoes a restore's row: the same paths, back to the version just before it. */
export function undoOf(stretch: HistoryStretch, paths: readonly string[]): Required<Omit<RestoreAsk, "also">> {
	const restore = stretch.restore;
	return {
		kind: restore?.kind ?? "project",
		target: restore?.target ?? "",
		to: stretch.from - 1,
		paths: [...paths],
	};
}
