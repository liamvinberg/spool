import { pageParent } from "../page-path";

/**
 * Why a frame owes a sitting. An edit is fresh work somebody is likely watching
 * for; a stale picture (its colour scheme went out from under it) and a missing
 * one are the backlog. Only a missing picture is skipped when one has turned up
 * by the time a tab is free. A timing is no picture: an edited frame whose
 * redraws the booth could not time right after its cover, because covers were
 * waiting or another frame was being timed, is timed in a sitting of its own,
 * after every cover, wherever it is (spool#318). An opening is a slide's
 * second picture, at the size a talk draws it (spool#319), owed the same way
 * when covers were waiting, and taken after every cover and before every
 * timing.
 */
export type BoothReason = "edited" | "stale" | "missing" | "opening" | "timing";

const REASON_RANK: Record<BoothReason, number> = { edited: 0, stale: 1, missing: 2, opening: 3, timing: 4 };

/**
 * What a frame owed two things is owed. The higher wins, except that a timing
 * and a picture that would not time it make an edit: one sitting owes both.
 * Every sitting of a slide takes the opening it owes, a timing's first.
 */
function owed(was: BoothReason, now: BoothReason): BoothReason {
	if (was === "opening" || now === "opening") {
		if (was === "timing" || now === "timing") return "timing";
		return REASON_RANK[now] < REASON_RANK[was] ? now : was;
	}
	if ((was === "timing") !== (now === "timing") && was !== "edited" && now !== "edited") return "edited";
	return REASON_RANK[now] < REASON_RANK[was] ? now : was;
}

/** One frame of one registered project. */
interface BoothFrame {
	root: string;
	/** The project's name, which is how a frame URL names it. */
	project: string;
	frame: string;
}

/** One frame owed a picture, and why. */
export interface Sitting extends BoothFrame {
	reason: BoothReason;
}

/**
 * What one open canvas shows, reported at camera rest: the page it is on and
 * the frames inside its viewport. A frame on screen is one somebody is looking
 * at; the rest of that page is a pan away.
 */
interface BoothView {
	root: string;
	page: string;
	frames: readonly string[];
}

/** Where a frame stands in the queue's order. */
type Place = "on screen" | "on an open page" | "elsewhere";

const PLACE_RANK: Record<Place, number> = { "on screen": 0, "on an open page": 1, elsewhere: 2 };
/** Where a timing or an opening waits: behind every cover. */
const PLACE_AFTER_ALL = 3;

export const keyOf = (root: string, frame: string) => `${root}\0${frame}`;

/**
 * The booth's one queue, as a model with no browser in it. Entries are keyed
 * by frame, so a frame is waiting at most once whatever asks for it, and the
 * order is decided when a tab asks for work rather than when the work arrived:
 * a canvas that pans changes what is on screen, and the next frame taken has
 * to be one from where it came to rest.
 *
 * The order is where a frame is first (on screen, on an open page, neither),
 * then why it is owed (an edit, a stale picture, a missing one), then how long
 * it has waited. A missing picture on screen goes ahead of an edit nobody can
 * see, because the one somebody is looking at is the one worth having first.
 */
export function createBoothQueue() {
	interface Waiting extends Sitting {
		seq: number;
	}
	const waiting = new Map<string, Waiting>();
	/** Frames in a tab now, each with what it is owed again once the tab is free. */
	const inTab = new Map<string, { sitting: Sitting; again: BoothReason | undefined }>();
	const views = new Map<string, { root: string; page: string; frames: ReadonlySet<string> }>();
	let seq = 0;

	function placeOf(root: string, frame: string): Place {
		let place: Place = "elsewhere";
		for (const view of views.values()) {
			if (view.root !== root) continue;
			if (view.frames.has(frame)) return "on screen";
			if (pageParent(frame) === view.page) place = "on an open page";
		}
		return place;
	}

	function add(sitting: Sitting): void {
		const key = keyOf(sitting.root, sitting.frame);
		const occupant = inTab.get(key);
		if (occupant !== undefined) {
			// the tab is photographing what the frame was: a missing picture is
			// being made right now, anything else sits again after
			if (sitting.reason === "missing") return;
			occupant.again = occupant.again === undefined ? sitting.reason : owed(occupant.again, sitting.reason);
			return;
		}
		const queued = waiting.get(key);
		if (queued === undefined) waiting.set(key, { ...sitting, seq: seq++ });
		else queued.reason = owed(queued.reason, sitting.reason);
	}

	/** The next frame for a free tab, which is now in it; a timing only when `timings` allows one. */
	function take(timings = true): Sitting | undefined {
		let best: Waiting | undefined;
		let bestPlace = Number.POSITIVE_INFINITY;
		for (const entry of waiting.values()) {
			if (!timings && entry.reason === "timing") continue;
			// a timing or an opening is no cover anyone waits for, wherever its frame is
			const place =
				entry.reason === "timing" || entry.reason === "opening"
					? PLACE_AFTER_ALL
					: PLACE_RANK[placeOf(entry.root, entry.frame)];
			if (
				best === undefined ||
				place < bestPlace ||
				(place === bestPlace &&
					(REASON_RANK[entry.reason] < REASON_RANK[best.reason] ||
						(entry.reason === best.reason && entry.seq < best.seq)))
			) {
				best = entry;
				bestPlace = place;
			}
		}
		if (best === undefined) return undefined;
		const key = keyOf(best.root, best.frame);
		waiting.delete(key);
		const sitting: Sitting = { root: best.root, project: best.project, frame: best.frame, reason: best.reason };
		inTab.set(key, { sitting, again: undefined });
		return sitting;
	}

	/** The tab is free of this frame. One owed again while it was in there goes back in line. */
	function release(sitting: BoothFrame): boolean {
		const key = keyOf(sitting.root, sitting.frame);
		const occupant = inTab.get(key);
		if (occupant === undefined) return false;
		inTab.delete(key);
		if (occupant.again === undefined) return false;
		add({ ...occupant.sitting, reason: occupant.again });
		return true;
	}

	/** A sitting the browser never finished, through no fault of the frame's: back in line as it was. */
	function putBack(sitting: Sitting): void {
		release(sitting);
		add(sitting);
	}

	/** The frame is gone: nothing is owed for it. */
	function drop(root: string, frame: string): void {
		const key = keyOf(root, frame);
		waiting.delete(key);
		const occupant = inTab.get(key);
		if (occupant !== undefined) occupant.again = undefined;
	}

	/** Everything owed for one project, which has left the registry. */
	function dropProject(root: string): void {
		for (const [key, entry] of waiting) if (entry.root === root) waiting.delete(key);
		for (const occupant of inTab.values()) if (occupant.sitting.root === root) occupant.again = undefined;
		for (const [id, view] of views) if (view.root === root) views.delete(id);
	}

	/** What one open canvas shows, or nothing once it has gone. */
	function view(id: string, next: BoothView | undefined): void {
		if (next === undefined) views.delete(id);
		else views.set(id, { root: next.root, page: next.page, frames: new Set(next.frames) });
	}

	return {
		add,
		take,
		release,
		putBack,
		drop,
		dropProject,
		view,
		placeOf,
		/** Frames waiting for a tab. */
		get waiting() {
			return waiting.size;
		},
		/** Of those, the ones owed only a timing. */
		get timings() {
			let count = 0;
			for (const entry of waiting.values()) if (entry.reason === "timing") count++;
			return count;
		},
		/** Of those, the ones owed a cover. */
		get covers() {
			let count = 0;
			for (const entry of waiting.values()) if (entry.reason !== "timing" && entry.reason !== "opening") count++;
			return count;
		},
		/** Frames in a tab right now. */
		get busy() {
			return inTab.size;
		},
	};
}

export type BoothQueue = ReturnType<typeof createBoothQueue>;
