/**
 * The canvas's side of Fast Refresh (the fast-refresh experiment,
 * `daemon/fast-refresh.ts`): each frame's update in flight, by id. The latest
 * offer alone is answered; an answer to an older one is stale. A refusal, or
 * no answer within the bound, is owed a reload, which `fallBack` pays; a reload
 * by any other path cancels the update in flight, so it pays nothing.
 *
 * The hand coming into a frame tells its document to drop the update in
 * flight (`handCame`), which it does unless it has committed already. One that
 * committed may have been read before the hand's write: if that write landed
 * while it ran, the answer says `outdated`; if not, the reload is `owe`d and
 * paid when the hand's write lands (`landed`).
 */
export interface HotUpdates {
	/** Send the frame an update and start its bound. */
	offer(frame: string, post: (id: number) => void): void;
	/**
	 * The document's answer: what became of the update it names. `outdated` is
	 * applied, with a write of the hand's landed on the frame while it ran.
	 */
	answer(frame: string, id: number, ok: boolean): "applied" | "outdated" | "refused" | "stale";
	/** The hand came into the frame: ask its document, once, to drop the update in flight. */
	handCame(frame: string, post: (id: number) => void): void;
	/** A write of the hand's landed on the frame: whether a swap it came into owes the reload now. */
	landed(frame: string): boolean;
	/** A swap committed under the hand: its reload is owed at the hand's next write. */
	owe(frame: string): void;
	/** Forget the frame's update in flight, its bound with it, and any reload owed: a reload pays it. */
	cancel(frame: string): void;
	/** The id of the frame's update in flight, if any. */
	pending(frame: string): number | undefined;
}

export function hotUpdates(
	boundMs: number,
	fallBack: (frame: string) => void,
	timers: {
		set: (run: () => void, ms: number) => unknown;
		clear: (timer: unknown) => void;
	} = {
		set: (run, ms) => setTimeout(run, ms),
		clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
	},
): HotUpdates {
	const inFlight = new Map<string, { id: number; timer: unknown; dropped: boolean; landed: boolean }>();
	const owed = new Set<string>();
	let seq = 0;
	const settle = (frame: string) => {
		const was = inFlight.get(frame);
		if (was === undefined) return;
		timers.clear(was.timer);
		inFlight.delete(frame);
	};
	const cancel = (frame: string) => {
		settle(frame);
		owed.delete(frame);
	};
	return {
		offer(frame, post) {
			cancel(frame);
			const id = ++seq;
			const timer = timers.set(() => {
				if (inFlight.get(frame)?.id !== id) return;
				inFlight.delete(frame);
				fallBack(frame);
			}, boundMs);
			inFlight.set(frame, { id, timer, dropped: false, landed: false });
			post(id);
		},
		answer(frame, id, ok) {
			const was = inFlight.get(frame);
			if (was?.id !== id) return "stale";
			settle(frame);
			return !ok ? "refused" : was.landed ? "outdated" : "applied";
		},
		handCame(frame, post) {
			const was = inFlight.get(frame);
			if (was === undefined || was.dropped) return;
			was.dropped = true;
			post(was.id);
		},
		landed(frame) {
			const was = inFlight.get(frame);
			if (was !== undefined) was.landed = true;
			return owed.delete(frame);
		},
		owe: (frame) => void owed.add(frame),
		cancel,
		pending: (frame) => inFlight.get(frame)?.id,
	};
}

/**
 * Which of a frame's documents boot hot (the fast-refresh experiment): every
 * frame boots the plain document, as with the experiment off, so a cold
 * page, covers and the player pay nothing for it, until it is saved or
 * reloaded while entered. From that boot on its documents are hot, and its
 * saves swap in. A document already booted never changes kind: entering a
 * plain one switches nothing until its next save.
 */
export interface HotBoots {
	/** From which document generation each frame boots hot. */
	readonly from: Readonly<Record<string, number>>;
	/** Whether the frame's document of this generation is hot. */
	hot(frame: string, nonce: number): boolean;
	/**
	 * A save reached the frame's document of this generation: swap it in, when
	 * that document is hot; otherwise it reloads, and its next document is hot.
	 */
	saved(frame: string, nonce: number): "swap" | "reload";
	/** The frame reloads into this generation: hot when a save asked for it, or the frame is entered. */
	reloading(frame: string, nonce: number, entered: boolean): void;
}

export function hotBoots(from: Record<string, number> = {}): HotBoots {
	const wanted = new Set<string>();
	const hot = (frame: string, nonce: number) => {
		const first = from[frame];
		return first !== undefined && nonce >= first;
	};
	return {
		from,
		hot,
		saved(frame, nonce) {
			if (hot(frame, nonce)) return "swap";
			wanted.add(frame);
			return "reload";
		},
		reloading(frame, nonce, entered) {
			if (!wanted.delete(frame) && !entered) return;
			const first = from[frame];
			if (first === undefined || nonce < first) from[frame] = nonce;
		},
	};
}

/**
 * Where the hand is (#314, #318, #319): an edit open in a frame, elements
 * picked in it, a write of the hand's it already shows, or a write about to
 * land on it (its own, or a shared file it reads). A frame the hand is in is
 * never swapped: the swap would run its components again under the words being
 * typed, or bring a bundle read before the hand's write landed.
 */
export interface Hand {
	editing: string | null;
	picked: readonly { frame: string }[];
	saved: { has(frame: string): boolean };
	writing: { has(frame: string): boolean };
}

export function handIn(hand: Hand, frame: string): boolean {
	return (
		hand.editing === frame ||
		hand.picked.some((pick) => pick.frame === frame) ||
		hand.saved.has(frame) ||
		hand.writing.has(frame)
	);
}

/**
 * What a change to a frame's file does to its document, with the experiment on:
 * `defer` while an element is picked in it, the reload owed until the hand
 * leaves (#319); `reload` when the document is not there to swap (not loaded,
 * already reloading, booted plain) or the hand is in it; `swap` otherwise.
 */
export function onChange(input: {
	hand: Hand;
	frame: string;
	/** What `HotBoots.saved` said of the frame's current document. */
	boot: "swap" | "reload";
	/** The document has said loaded and no reload is under way. */
	open: boolean;
}): "defer" | "reload" | "swap" {
	const { hand, frame, boot, open } = input;
	if (hand.picked.some((pick) => pick.frame === frame)) return "defer";
	if (boot === "reload" || !open || handIn(hand, frame)) return "reload";
	return "swap";
}

/**
 * What a document's answer to an update leaves: `keep` an applied swap the
 * hand stayed out of; a refusal owes the reload, `defer`red while an element is
 * picked there (#319). A swap the hand came into while it ran may be older than
 * the hand's write, and the frame never shows an older version than the file:
 * one a write of the hand's landed during (`outdated`) reloads now, pick or
 * not; one the hand is in otherwise `owe`s the reload to the hand's next
 * write, deferred to the hand leaving meanwhile. A `stale` answer does nothing.
 */
export function onAnswer(
	outcome: "applied" | "outdated" | "refused" | "stale",
	hand: Hand,
	frame: string,
): "keep" | "defer" | "owe" | "reload" | "stale" {
	if (outcome === "stale") return "stale";
	if (outcome === "outdated") return "reload";
	const picked = hand.picked.some((pick) => pick.frame === frame);
	if (outcome === "refused") return picked ? "defer" : "reload";
	if (!handIn(hand, frame)) return "keep";
	return picked ? "owe" : "reload";
}
