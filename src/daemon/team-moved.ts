import type { Moved, MovedPath } from "../team-sync-protocol";

/**
 * What Spool renamed or moved in a team project, held until the team has it (spool#160). A rename rewrites the walks
 * inside a moved frame, so the team can't tell a move from a delete and an add by their bytes: the copy says what
 * moved on each save or bundle that deletes the old files, for comments to follow. The new files may go apart from
 * the deletes, and a big page's deletes over several bundles: each that carries one says it again, and the team
 * holds the move once the old frame or page is gone.
 */
export interface MovesToSay {
	/** Frames or pages Spool just renamed or moved on this Mac. */
	said(moved: Moved): void;
	/**
	 * What a save or bundle deleting these design/-relative paths says it moved, if anything. `held` says whether the
	 * team still holds anything under a folder: a move whose old folder the team no longer holds has been said.
	 */
	carried(deleted: readonly string[], held: (folder: string) => boolean): Moved | undefined;
}

/** How long a move waits to be said at most: its deletes may wait on a long pause, but not for ever. */
export const MOVE_SAID_MS = 60 * 60_000;

export function movesToSay(now: () => number = Date.now): MovesToSay {
	let waiting: { kind: "frames" | "pages"; move: MovedPath; at: number; carried: boolean }[] = [];
	return {
		said(moved) {
			const at = now();
			for (const move of moved.frames ?? []) waiting.push({ kind: "frames", move, at, carried: false });
			for (const move of moved.pages ?? []) waiting.push({ kind: "pages", move, at, carried: false });
		},
		carried(deleted, held) {
			if (waiting.length === 0) return undefined;
			waiting = waiting.filter(
				(one) => now() - one.at < MOVE_SAID_MS && !(one.carried && !held(`frames/${one.move.from}/`)),
			);
			const moved: Required<Moved> = { frames: [], pages: [] };
			for (const one of waiting) {
				const folder = `frames/${one.move.from}/`;
				if (!deleted.some((path) => path.startsWith(folder))) continue;
				one.carried = true;
				moved[one.kind].push(one.move);
			}
			if (moved.frames.length === 0 && moved.pages.length === 0) return undefined;
			return {
				...(moved.frames.length > 0 ? { frames: moved.frames } : {}),
				...(moved.pages.length > 0 ? { pages: moved.pages } : {}),
			};
		},
	};
}
