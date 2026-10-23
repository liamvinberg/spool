import type {
	HistoryRestore,
	HistoryScope,
	HistoryStretch,
	RestoreAsk,
	RestoreKind,
	VersionChange,
	VersionFrame,
} from "../api";
import { fileOf, frameOf, timeOf } from "./history-model";

/**
 * How the History pane says a version and its restore (task 225, after spool#188): a row is a version, the canvas
 * shows it, and Restore this version… asks one question listing each frame that would change, ticked, so restoring
 * part of it is unticking. A frame the version deleted is brought back on its own. Undoing a restore is a restore of
 * the same paths to just before it.
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

/** `a`, `a and b`, `a, b and c`. */
export function listOf(names: readonly string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Frames by their own names, three at most before they are counted: `cart and promo`, `4 frames`. */
export function framesSays(frames: readonly string[]): string {
	return frames.length > 3 ? `${frames.length} frames` : listOf(frames.map(fileOf));
}

/**
 * What a restore put back, to when: `cart to 14:52 today`. A version's restore of some frames is the project's kind
 * of restore, so its row names the frames its saves touched, from `paths`.
 */
export function restoredSays(
	restore: Pick<HistoryRestore, "kind" | "target" | "toAt">,
	paths: readonly string[] = [],
	now: number = Date.now(),
): string {
	const frames = [...new Set(paths.flatMap((path) => frameOf(path) ?? []))].sort();
	const what = restore.kind === "project" && frames.length > 0 ? framesSays(frames) : targetSays(restore);
	return restore.toAt === null ? what : `${what} to ${momentSays(restore.toAt, now)}`;
}

/** The restore that undoes a restore's row: the same paths, back to the version just before it. */
export function undoOf(
	stretch: HistoryStretch,
	paths: readonly string[],
): Required<Omit<RestoreAsk, "also" | "frames">> {
	const restore = stretch.restore;
	return {
		kind: restore?.kind ?? "project",
		target: restore?.target ?? "",
		to: stretch.from - 1,
		paths: [...paths],
	};
}

/** What a version did to a frame, as the chip on its name says it. */
export function didSays(did: NonNullable<VersionFrame["did"]>): string {
	return did === "deleted" ? "deleted here" : did;
}

/** What restoring a version does to a frame, beside its tick. */
export function changeSays(change: VersionChange): string {
	if (change === "back") return "comes back";
	if (change === "gone") return "goes, it didn't exist then";
	return "goes back to how it was";
}

/** The frames the question ticks at first: in a frame's history that frame alone, in the project's every one. */
export function tickedAtFirst(differs: readonly { frame: string }[], scope: HistoryScope): string[] {
	const all = differs.map(({ frame }) => frame);
	if (scope.kind === "project") return all;
	return all.includes(scope.frame) ? [scope.frame] : all;
}

/** The restore a version's question makes: one frame is a frame's restore, several the project's, by their folders. */
export function versionRestore(to: number, frames: readonly string[], also: readonly string[]): RestoreAsk {
	const [only] = frames;
	return {
		kind: frames.length === 1 && only !== undefined ? "frame" : "project",
		target: frames.length === 1 && only !== undefined ? only : "",
		to,
		frames: [...frames],
		also: [...also],
	};
}

/** The question's button: Restore, or how many of the frames when some are unticked. */
export function restoreLabel(ticked: number, offered: number): string {
	return ticked === offered ? "Restore" : `Restore ${ticked} of ${offered}`;
}

/** The stretch ↑ (newer, -1) or ↓ (older, 1) from the one shown, null for now; undefined past the oldest. */
export function stepOf(
	listed: readonly HistoryStretch[],
	shown: HistoryStretch | null,
	by: 1 | -1,
): HistoryStretch | null | undefined {
	const at = shown === null ? -1 : listed.findIndex((each) => each.from === shown.from && each.to === shown.to);
	const next = at + by;
	if (next < 0) return null;
	return listed[next];
}

/** Over a version's set-aside save: whose save arrived first, if spool.page could say. */
export function setAsideSays(by: string, path: string, stood: { by: { name: string } } | null): string {
	const file = fileOf(path);
	return stood === null
		? `${by}'s save to ${file} was set aside.`
		: `${stood.by.name}'s save arrived first, so ${by}'s save to ${file} was set aside.`;
}
