import { type RefObject, useEffect, useRef, useState } from "react";
import type { StampShift } from "../../daemon/hand-write";
import {
	type HeldPatch,
	type MoveAsk,
	type MovePlace,
	type RungRead,
	revertPatch,
	type TextWritten,
	writeElement,
	writeText,
} from "../api";
import type { Point } from "./camera";
import type { CanvasStore } from "./canvas-store";
import { moveAsk } from "./element-move";
import { deepest, openingOf, parentOf, wordsAsk } from "./element-selection";
import {
	deleteAsk,
	GONE,
	type HandEdit,
	OPENING_MS,
	REFUSAL_MS,
	type Refusal,
	refusedIn,
	restamped,
	type ShownRefusal,
	stampOf,
	stampPath,
	wordsOf,
} from "./hand-edit";
import type { History, HistoryEntry, Way } from "./history";
import { amend, drop } from "./history";
import type { PickedSelection } from "./overlays";
import {
	alterMessage,
	type EditedNode,
	editMessage,
	endEditMessage,
	type Family,
	familyMessage,
	type KinStep,
	moveMessage,
	type PickedHit,
	pickKey,
	restampMessage,
	restoreMessage,
} from "./protocol";
import type { Notice } from "./toast";

/**
 * The hand's edit lane (#314–#340): words, delete, move and undo, from the
 * gesture to the file and back. The canvas hands it intents and the frame's
 * answers; it hands back refusals, drawn under the element they were about.
 *
 * Every write is measured against the file it was read out of, and one rule
 * says what happens when that read is missing (`measured`): a read still on
 * its way is waited for, and one that never came is the `unread` refusal.
 */

/** How long a frame has to answer an ask before the canvas stops waiting. */
export const PICK_REPLY_MS = 400;
/** how long a hand edit's outgoing document may stand before the still returns */
export const HOLD_PAINT_MS = 3000;

/** The refusal for a write with no read to measure it against (DEV-299). */
export const UNREAD: Refusal = { code: "unread", says: "the file was never read; select the element again" };

/** A write that said what the file already said: no characters moved, so it is no step. */
export function wroteNothing(undo: HeldPatch): boolean {
	return undo.start === undo.end && undo.text === "";
}

type Setter<T> = (next: T | ((current: T) => T)) => void;

/** What the lane takes from the canvas: its frames, its selection, its history. */
export interface HandEditDeps {
	project: string;
	store: CanvasStore;
	/** the selection as drawn: a refusal goes when it moves */
	picked: readonly PickedSelection[];
	iframes: RefObject<Map<string, HTMLIFrameElement>>;
	/** the one sequence every ask to a frame takes its id from */
	pickSeq: RefObject<number>;
	/** the frames reloaded whose new document has not said loaded yet (#340) */
	reloading: RefObject<Set<string>>;
	/** frames whose next reload the canvas caused, held behind their last paint */
	holdNext: RefObject<Set<string>>;
	/** the frames the hand has saved and is still in (#314) */
	saved: RefObject<Map<string, { source: string; fingerprint: string; own: boolean }>>;
	pickedChain: RefObject<{ frame: string; chain: PickedHit[] } | null>;
	generationWaiters: RefObject<Map<number, (answer: { chain: PickedHit[]; hits: PickedHit[] }) => void>>;
	viewportRef: RefObject<HTMLElement | null>;
	history: RefObject<History>;
	setEditing: Setter<HandEdit | null>;
	setPicked: Setter<PickedSelection[]>;
	setSelected: Setter<string[]>;
	setSaves: Setter<Record<string, number>>;
	setNotice: (notice: Notice | null) => void;
	updateHistory: (next: History) => void;
	recordEntry: (entry: HistoryEntry) => void;
	reloadFrameDocument: (frame: string) => void;
	frameHeld: (frame: string) => boolean;
	sharedWrite: (frame: string, path: string) => boolean;
	holdChain: (next: { frame: string; chain: PickedHit[] } | null) => void;
	holdFrame: (frame: string) => void;
	whenLoaded: (frame: string, then: () => void) => void;
	walkKin: (frame: string, selector: string, step: KinStep, gone?: () => void) => void;
	repick: (frame: string, selectors: readonly string[], gone: () => void) => void;
	selectGeneration: (frame: string, selector: string, of: Family) => void;
	beginPick: (frame: string, local: Point, apply: (chain: PickedHit[]) => void) => void;
	applyPick: (frame: string, chain: PickedHit[], hit: PickedHit | undefined) => void;
	askFrame: <T>(
		frame: string,
		waiters: Map<number, (value: T) => void>,
		request: (id: number) => unknown,
		apply: (value: T) => void,
		onSilence?: () => void,
	) => void;
}

/** The frame's answer to a delete (#317), and to a move with where the element went (#340). */
export interface Altered {
	ok: boolean;
	owner: string | null;
	chain?: PickedHit[];
	held?: true;
}

/**
 * The lane itself, outside React: the canvas reaches it through `useHandEdit`,
 * which hands it the canvas as it was last drawn.
 */
export function createHandEdit(deps: () => HandEditDeps, setRefused: Setter<ShownRefusal | null>) {
	/**
	 * The held element's own read, as the handlers see it: the selection's
	 * read, noted while the canvas draws, because a write has to be measured
	 * against the file the element was read out of rather than against a render.
	 */
	let heldRead: RungRead | undefined;
	/** the selection's read as the handlers see it, a paint earlier than the render */
	let railRungs: readonly (RungRead | undefined)[] | null = null;
	/** whether that read is still on its way */
	let railReading = false;
	let readWaiters: (() => void)[] = [];
	let readRetrying = false;
	/** the frame's answer to putting one edit's words back (#314) */
	const restoreWaiters = new Map<number, (ok: boolean) => void>();
	const alterWaiters = new Map<number, (answer: Altered) => void>();
	/**
	 * The reorder in flight (#340). One move at a time, because the next one
	 * is addressed by stamps only the reloaded document has; presses made
	 * meanwhile wait their turn, each still its own write and its own step.
	 */
	const moveRun: { busy: boolean; queue: (() => void)[]; timer?: ReturnType<typeof setTimeout> } = {
		busy: false,
		queue: [],
	};
	/**
	 * Each file as the hand's last write or step left it (#340). A move
	 * lands on a new stamp, and the selection's read of it is a round trip
	 * behind; until it catches up this is what the next move is measured
	 * against. Something else writing the file since makes it stale, which
	 * is the refusal it should be.
	 */
	const handPrints = new Map<string, string>();
	let openTimer: ReturnType<typeof setTimeout> | undefined;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	// --- the read every write is measured against (#314, DEV-299) ------------------

	/** The selection's read, as the canvas last drew it. */
	const noteRead = (held: RungRead | undefined, rungs: readonly (RungRead | undefined)[] | null, reading: boolean) => {
		heldRead = held;
		railRungs = rungs;
		railReading = reading;
	};

	/**
	 * A gesture made before the selection's read has landed (DEV-299) waits for
	 * it rather than refusing that the file was never read: a click and ⌫ at
	 * once are one intent, and the read is the click's. The gesture runs again
	 * once the read is in, and only then may it refuse — the second time round
	 * this says no, so a read that never comes ends in the honest refusal.
	 */
	const afterRead = (gesture: () => void): boolean => {
		if (readRetrying || !railReading) return false;
		readWaiters.push(gesture);
		return true;
	};

	/** The read is in, or gone so long that the honest answer is the refusal: what waited on it goes. */
	const readSettled = () => {
		const waiting = readWaiters;
		readWaiters = [];
		readRetrying = true;
		try {
			for (const gesture of waiting) gesture();
		} finally {
			readRetrying = false;
		}
	};

	/**
	 * The read-before-edit rule. A write goes only measured against the file
	 * it was read out of: the fingerprint, when there is one. Without it, a
	 * read still on its way is waited for and the gesture runs `again` once it
	 * lands; a read that never came is refused as `unread`. Nothing comes back
	 * either way, and the gesture stops there.
	 */
	const measured = (
		fingerprint: string | undefined,
		again: () => void,
		refuse: (refusal: Refusal) => void,
	): string | undefined => {
		if (fingerprint !== undefined) return fingerprint;
		if (!afterRead(again)) refuse(UNREAD);
		return undefined;
	};

	/**
	 * The fingerprint the canvas holds for the file a stamp names (#314).
	 *
	 * Every write is measured against the file the surface read it out of, and
	 * a write that reaches a call site one owner up reaches a second file — so
	 * that one is looked up the same way: the hand's own last save on this
	 * frame first, because it is newer than any read, then the elements of the
	 * selection's own read. Nothing when neither knows the file, which leaves
	 * the daemon's fresh read of it the first anybody has seen.
	 */
	const fingerprintFor = (frame: string, stamp: string): string | undefined => {
		const path = stampPath(stamp);
		const own = deps().saved.current.get(frame);
		if (own !== undefined && stampPath(own.source) === path) return own.fingerprint;
		for (const read of railRungs ?? []) {
			if (read?.path === path && read.fingerprint !== undefined) return read.fingerprint;
		}
		return undefined;
	};

	// --- where a write lands (#314, #318) ------------------------------------------

	/**
	 * The other frames rendering a shared file the hand is about to write
	 * (#318), read off the element before the gesture. Each is showing a document
	 * the file is about to stop saying, and the watcher's echo will reload it;
	 * its last paint is held from here, before the write leaves, so that
	 * reload lands behind the document on screen rather than through a still
	 * of the old design — the echo can reach the canvas before the answer
	 * does, so nothing about this may wait on the answer. A write that lands
	 * somewhere else after all, or not at all, lets them go.
	 */
	const holdReaders = (frame: string, readers: readonly string[]) => {
		const { iframes, holdNext } = deps();
		for (const other of readers) if (other !== frame && iframes.current.has(other)) holdNext.current.add(other);
	};
	const releaseReaders = (frame: string, readers: readonly string[]) => {
		const { holdNext } = deps();
		for (const other of readers) if (other !== frame) holdNext.current.delete(other);
	};

	/**
	 * What a write that has landed leaves behind, whichever direction it ran.
	 *
	 * The frame already shows the words, so it is not reloaded (rule 4): the
	 * file is a fresh read for the element, the stamps a save shifted along its
	 * line are moved in the document and in the held picks, and the frame is
	 * remembered as saved so the watcher's echo of this write reloads nothing
	 * and leaving the frame does. A frame the hand had already left, or a
	 * write only a reload can place, reloads behind its hold now.
	 */
	const landed = (
		frame: string,
		readAt: string,
		written: { path: string; fingerprint: string; shifts: StampShift[] | null },
	): void => {
		const d = deps();
		d.setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
		handPrints.set(written.path, written.fingerprint);
		if (written.shifts === null || !d.frameHeld(frame)) {
			d.saved.current.delete(frame);
			d.holdNext.current.add(frame);
			d.reloadFrameDocument(frame);
			return;
		}
		d.saved.current.set(frame, {
			source: readAt,
			fingerprint: written.fingerprint,
			own: !d.sharedWrite(frame, written.path),
		});
		const shifts = written.shifts;
		if (!shifts.some((shift) => shift.delta !== 0)) return;
		const file = written.path.replace(/^design\//, "");
		d.iframes.current.get(frame)?.contentWindow?.postMessage(restampMessage(file, shifts), "*");
		const move = (source: string | null) => (source === null ? null : restamped(source, file, shifts));
		d.setPicked((current) =>
			current.map((pick) => (pick.frame === frame ? { ...pick, source: move(pick.source) } : pick)),
		);
		const chain = d.pickedChain.current;
		if (chain?.frame === frame) {
			d.holdChain({ frame, chain: chain.chain.map((hit) => ({ ...hit, source: move(hit.source) })) });
		}
	};

	/**
	 * What every hand write does with its answer (#314–#318).
	 *
	 * The gestures differ in what they send and in what they do with a
	 * write that landed; everything between was the same thirty lines written
	 * out for each. The readers held before the write go free the moment it
	 * turns out not to have reached them; a refusal is shown where the gesture
	 * was, and one about a file that moved underneath re-reads the element; a
	 * write that said what the file already said is no step at all; and a write
	 * that landed is one history entry and, once per project, the line about
	 * nothing catching hand edits.
	 */
	const settled = (
		written: TextWritten | undefined,
		about: {
			frame: string;
			/** the frames rendering a shared file, held before the write left */
			readers: readonly string[];
			/** the ask the frame holds the DOM half of this write under */
			edit: number;
			/** the element the write was about, which is what walking its entry points at again (#322) */
			selector: string;
			/** the stamp the entry re-reads its element at, given the file the write landed in */
			readAt: (path: string) => string;
			refuse: (refusal: Refusal) => void;
			/** the sentence for a write that never reached the daemon at all */
			failed: string;
			/** what this gesture's entry carries beyond the patch */
			entry?: Pick<Extract<HistoryEntry, { kind: "hand" }>, "picks" | "movedTo">;
			/** the write landed */
			onLanded?: () => void;
		},
	) => {
		const d = deps();
		const { frame, readers } = about;
		if (written === undefined) {
			releaseReaders(frame, readers);
			about.refuse({ code: "failed", says: about.failed });
			return;
		}
		if (!written.ok) {
			releaseReaders(frame, readers);
			about.refuse(written.refusal);
			// a file that moved underneath is a fresh read of the element
			if (written.refusal.code === "stale-file") {
				d.setSaves((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
			}
			return;
		}
		const shared = d.sharedWrite(frame, written.path);
		if (!shared || wroteNothing(written.undo)) releaseReaders(frame, readers);
		if (wroteNothing(written.undo)) return;
		const readAt = about.readAt(written.path);
		landed(frame, readAt, written);
		d.recordEntry({
			kind: "hand",
			frame,
			selector: about.selector,
			edit: about.edit,
			patch: written.undo,
			readAt,
			...(about.entry ?? {}),
			...(shared ? { frames: readers } : {}),
		});
		about.onLanded?.();
		if (written.uncaught === true) {
			d.setNotice({ kind: "success", message: "No history here: nothing is catching hand edits" });
		}
	};

	// --- undo and redo (#314, #317) ------------------------------------------------

	/** The DOM half of undo and redo: the frame puts one edit's words back itself, and says whether it could. */
	const restoreWords = (frame: string, edit: number, way: "before" | "after", then: (ok: boolean) => void) => {
		const d = deps();
		const target = d.iframes.current.get(frame)?.contentWindow;
		// a document still booting holds no edit of the one before it (#340)
		if (target == null || d.reloading.current.has(frame)) {
			then(false);
			return;
		}
		const ask = ++d.pickSeq.current;
		restoreWaiters.set(ask, then);
		target.postMessage(restoreMessage(edit, way, ask), "*");
		setTimeout(() => {
			if (restoreWaiters.delete(ask)) then(false);
		}, PICK_REPLY_MS);
	};

	/** The frame's answer to `restoreWords`. */
	const restored = (id: number, ok: boolean) => {
		const waiter = restoreWaiters.get(id);
		restoreWaiters.delete(id);
		waiter?.(ok);
	};

	/** The frame's answer to a delete or a move. */
	const altered = (id: number, answer: Altered) => {
		const waiter = alterWaiters.get(id);
		alterWaiters.delete(id);
		waiter?.(answer);
	};

	/**
	 * One hand entry, run either way (#314, #317). The patch goes back over the
	 * wire, the daemon re-checks the fingerprint, and what comes back is the
	 * inverse this entry carries from here on. A refusal means the file moved
	 * since — the step is dropped, and said so. The DOM half is the frame's own:
	 * it puts the words or the elements back on its nodes; one that no longer
	 * holds them reloads behind its hold.
	 */
	const walkHand = (entry: Extract<HistoryEntry, { kind: "hand" }>, way: Way, taking: History) => {
		const d = deps();
		/**
		 * The step is in the document: the ring goes back on the element it
		 * was about (#322), its box read again because a word put back moves
		 * the box it is drawn in. A step that took the element
		 * away has nothing to point at, and the frame is what is left held.
		 */
		const lost = () => {
			const now = deps();
			now.holdChain(null);
			now.setPicked([]);
			now.setSelected([entry.frame]);
		};
		const rering = () =>
			deps().whenLoaded(entry.frame, () => {
				const held = entry.picks;
				if (held !== undefined && held.length > 1) {
					deps().repick(entry.frame, held, lost);
					return;
				}
				// a move's element stands where the step left it: back where it
				// was for an undo, where it went for a redo (#340)
				const selector = way === "redo" && entry.movedTo !== undefined ? entry.movedTo : entry.selector;
				deps().walkKin(entry.frame, selector, "self", lost);
			});
		const readers = entry.frames ?? [];
		holdReaders(entry.frame, readers);
		void revertPatch(d.project, entry.patch).then((reverted) => {
			const now = deps();
			// a press that landed after this one owns the stacks now
			if (now.history.current !== taking) return;
			if (reverted === undefined || !reverted.ok) {
				releaseReaders(entry.frame, readers);
				now.updateHistory(drop(now.history.current, way));
				now.setNotice({
					kind: "error",
					message:
						reverted === undefined
							? "The step could not be put back"
							: "The file changed since; this step is dropped",
				});
				return;
			}
			now.updateHistory(amend(now.history.current, way, { ...entry, patch: reverted.undo }));
			landed(entry.frame, entry.readAt, reverted);
			const held = (ok: boolean) => {
				const later = deps();
				if (!ok && later.saved.current.has(entry.frame)) {
					later.saved.current.delete(entry.frame);
					later.holdNext.current.add(entry.frame);
					later.reloadFrameDocument(entry.frame);
					// the document is being replaced: its own arrival is what the
					// ring waits on, not this answer
					return;
				}
				rering();
			};
			restoreWords(entry.frame, entry.edit, way === "undo" ? "before" : "after", held);
		});
	};

	// --- the hand's refusals -----------------------------------------------------

	/**
	 * The refusal note (#339): why the gesture just tried does not apply, said
	 * under the element it was about, with "Ask the agent" carrying what was
	 * tried. Every refusal a hand meets comes through here — ⌫, Enter on words,
	 * and a move once there is one — and never goes to the notice strip. It
	 * goes by itself after `REFUSAL_MS`, or when the selection moves.
	 */
	const showRefusal = (shown: ShownRefusal) => {
		setRefused(shown);
	};

	// --- the text gesture (#255, #314) --------------------------------------------

	/**
	 * End an open edit from out here, which is what a press anywhere on the
	 * field means. The frame answers with `edited` either way, and that answer
	 * is what writes — this only says which way it ended. One the frame never
	 * answers for is let go anyway, or it would hold that frame's pointer for
	 * the rest of the session.
	 */
	const endEdit = (commit: boolean) => {
		const d = deps();
		const held = d.store.get().editing;
		if (held === null) return;
		d.iframes.current.get(held.frame)?.contentWindow?.postMessage(endEditMessage(commit), "*");
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			const now = deps();
			if (now.store.get().editing?.id === held.id) now.setEditing(null);
		}, PICK_REPLY_MS);
	};

	/**
	 * The text gesture (#255): the caret in an element's own words, at once
	 * (#314) — where the pointer was, or after the words when the keyboard
	 * opened them (`null`). Nothing is asked first, with one exception: where
	 * the selection's read of the file has already said a hand cannot write
	 * these words (#339), that is said on the element instead of opening them.
	 * Otherwise the frame makes the element editable the moment the message
	 * lands, and whether the file will take the words is the daemon's answer
	 * when the edit ends. The fingerprint the write will carry is the one the
	 * selection's read holds for this very element, when that read has landed.
	 */
	const beginTextEdit = (pick: PickedSelection, local: Point | null) => {
		const d = deps();
		const open = d.store.get().editing;
		if (open?.frame === pick.frame && open.selector === pick.selector) return;
		const refuse = (refusal: Refusal) =>
			showRefusal({ frame: pick.frame, selector: pick.selector, refusal, asked: wordsAsk(pick) });
		const stamp = stampOf(pick);
		if (typeof stamp !== "string") {
			refuse(stamp);
			return;
		}
		const read = heldRead;
		const opening = openingOf(pick, read);
		if (opening.kind === "refused") {
			refuse(opening.refusal);
			return;
		}
		const target = d.iframes.current.get(pick.frame);
		if (target?.contentWindow == null) return;
		const id = ++d.pickSeq.current;
		d.setEditing({
			frame: pick.frame,
			selector: pick.selector,
			source: stamp,
			id,
			fingerprint: read?.source === stamp ? read.fingerprint : undefined,
			phase: "opening",
			start: "",
		});
		setRefused(null);
		target.contentWindow.postMessage(editMessage(pick.selector, local?.x ?? null, local?.y ?? null, id), "*");
		// typing has to land in the frame, which only happens once the
		// document it is drawn in holds the focus
		target.focus();
		clearTimeout(openTimer);
		openTimer = setTimeout(() => {
			const now = deps();
			const held = now.store.get().editing;
			if (held?.id === id && held.phase === "opening") now.setEditing({ ...held, phase: "open" });
		}, OPENING_MS);
	};

	/**
	 * Enter and a double-click on one element (#339): its words where it has
	 * words of its own, and its children where it is a group.
	 */
	const openElement = (pick: PickedSelection, local: Point | null) => {
		if (pick.words === true) beginTextEdit(pick, local);
		else deps().selectGeneration(pick.frame, pick.selector, "children");
	};

	/**
	 * Enter, from the keyboard (#339): the words or the children of the one
	 * element held, or the top-level elements of the one frame held — which
	 * is how a person with no pointer gets from a frame into it. It says
	 * whether it had anything to act on, which is what lets ⏎ go on meaning
	 * everything else it means when it did not.
	 */
	const openHeld = (): boolean => {
		const d = deps();
		const { store } = d;
		if (store.get().entered !== null || store.get().editing !== null) return false;
		const picks = store.get().picked;
		const only = picks.length === 1 ? picks[0] : undefined;
		if (only !== undefined) {
			openElement(only, null);
			return true;
		}
		if (picks.length > 1) return false;
		const frame = store.get().selected.length === 1 ? store.get().selected[0] : undefined;
		if (frame === undefined) return false;
		d.selectGeneration(frame, "", "children");
		return true;
	};

	/** A double-click in Edit (#339): the deepest element under it, opened. */
	const openAt = (frame: string, local: Point) => {
		deps().beginPick(frame, local, (chain) => {
			const target = deepest(chain);
			if (target === undefined) return;
			const d = deps();
			const open = d.store.get().editing;
			if (open?.frame === frame && open.selector === target.selector) return;
			d.applyPick(frame, chain, target);
			openElement({ frame, ...target }, local);
		});
	};

	/**
	 * F2 (#323): the words of the one element held, and nothing else. The
	 * rename key the sidebar already uses, on the element rather than on a row.
	 */
	const openWords = (): boolean => {
		const { store } = deps();
		if (store.get().entered !== null || store.get().editing !== null) return false;
		const only = store.get().picked.length === 1 ? store.get().picked[0] : undefined;
		if (only === undefined || only.words !== true) return false;
		beginTextEdit(only, null);
		return true;
	};

	/**
	 * The edit has ended (#314). The frame already shows the words, so the
	 * ring is re-read off the element they are drawn in, and a commit that
	 * changed them is one write in the background. A refusal puts the words
	 * back on the element and sits under it with the reason and the door to
	 * the agent; a file that moved underneath is a fresh read of the element too.
	 */
	const finishEdit = (held: HandEdit, commit: boolean, nodes: readonly EditedNode[], owner: string | null) => {
		const d = deps();
		d.setEditing(null);
		d.viewportRef.current?.focus();
		// the box the words are drawn in moved with them, so the ring is
		// re-read off the element itself — while it is still the one held: a
		// click that ended this edit has already moved the selection on
		const stillHeld = d.store
			.get()
			.picked.find((pick) => pick.frame === held.frame && pick.selector === held.selector);
		if (stillHeld !== undefined) d.walkKin(held.frame, held.selector, "self");
		const attempted = wordsOf(nodes);
		if (!commit || attempted === held.start) return;
		const read = heldRead;
		const refuse = (refusal: Refusal) => {
			restoreWords(held.frame, held.id, "before", () => {});
			// on the element, and only there: once the selection has moved on
			// there is nothing to draw it under, and the words simply go back
			showRefusal({
				frame: held.frame,
				selector: held.selector,
				refusal,
				asked: `Change the words of the ${stillHeld?.tag ?? "element"}`,
				attempted,
			});
		};
		const fingerprint = measured(
			held.fingerprint ?? (read?.source === held.source ? read.fingerprint : undefined),
			() => finishEdit(held, commit, nodes, owner),
			refuse,
		);
		if (fingerprint === undefined) return;
		// the element's file may be a shared definition's; whether the words
		// land there or at a call site in this frame's own file is the daemon's
		// to say, so its readers are held now and let go if they did not
		const readers = read?.source === held.source ? (read.shared?.frames ?? []) : [];
		holdReaders(held.frame, readers);
		// the call site is a second file, and a second promise: the canvas sends
		// what it read that file at, and the daemon refuses if it has moved
		const ownerFingerprint = owner === null ? undefined : fingerprintFor(held.frame, owner);
		void writeText(d.project, held.frame, {
			source: held.source,
			nodes,
			fingerprint,
			...(owner === null ? {} : { owner }),
			...(ownerFingerprint === undefined ? {} : { ownerFingerprint }),
		}).then((written) => {
			settled(written, {
				frame: held.frame,
				selector: held.selector,
				readers,
				edit: held.id,
				// the stamp in the file that was written: the element's own, or
				// the call site's when the words were supplied there
				readAt: (path) => (path === stampPath(held.source) ? held.source : owner) ?? held.source,
				refuse,
				failed: "the words did not reach the file",
			});
		});
	};

	// --- delete (#317) ------------------------------------------------------------

	/**
	 * What the hand holds once an element is gone: its parent, or the frame
	 * when it had none. Never nothing — a frame the hand is still in is
	 * what keeps its own save from reloading it out from under the gesture.
	 */
	const holdParent = (pick: PickedSelection) => {
		const d = deps();
		const up = parentOf({ picks: [pick], chain: d.pickedChain.current });
		if (up !== undefined && up.hit !== null) {
			d.holdChain({ frame: up.frame, chain: [...up.chain] });
			d.setPicked([{ frame: up.frame, ...up.hit }]);
			return;
		}
		d.holdChain(null);
		d.setPicked([]);
		d.setSelected([pick.frame]);
	};

	/**
	 * One delete, in the frame and then in the file.
	 *
	 * The frame changes first and answers with whether it could and with the
	 * call one owner up — the only place that knows it. Then one write in the
	 * background, addressed by the stamp and measured against the file the
	 * element was read out of. A refusal puts the document back exactly as it was and
	 * sits under the element with the reason and the door to the agent.
	 *
	 * A delete of something that is all of a component is refused rather than
	 * quietly turned into a delete of the call: no body can lose its whole
	 * return, and taking the call out of this frame is a different thing to
	 * mean. The notice names the file the component is written in and offers
	 * that delete as one press, which sends the same gesture again on the
	 * call's own stamp and against the call's own file.
	 */
	const alterElement = (
		picks: readonly PickedSelection[],
		at: {
			sources: readonly string[];
			fingerprint: string;
			item?: { source: string; index: number; fingerprint: string };
		},
	) => {
		const d = deps();
		const pick = picks[0];
		const source = at.sources[0];
		if (pick === undefined || source === undefined) return;
		// One row of a list goes as the row (#324): the file loses the array
		// entry, and the document loses that entry's own element rather than
		// the one under the pointer, which is an element inside it.
		const gone = at.item !== undefined && pick.item !== undefined ? { ...pick, selector: pick.item.selector } : pick;
		const target = d.iframes.current.get(pick.frame)?.contentWindow;
		if (target == null) return;
		const id = ++d.pickSeq.current;
		setRefused(null);
		const asked = deleteAsk(picks.map((held) => held.tag));
		const refuse = (refusal: Refusal, instead?: ShownRefusal["instead"]) => {
			restoreWords(pick.frame, id, "before", () => {});
			showRefusal({
				frame: pick.frame,
				selector: pick.selector,
				refusal,
				asked,
				...refusedIn(refusal, source),
				...(instead === undefined ? {} : { instead }),
			});
		};
		/**
		 * The delete a whole-return refusal offers: the call that renders it,
		 * on the call's own stamp and against the call's own file. Nothing
		 * where the frame named no call or the canvas has never read the file
		 * that call is in, because then there is nothing to measure it against.
		 */
		const insteadDeleteCall = (refusal: Refusal, call: string | null) => {
			if (picks.length !== 1 || refusal.code !== "whole-return" || call === null) {
				return undefined;
			}
			const fingerprint = fingerprintFor(pick.frame, call);
			if (fingerprint === undefined) return undefined;
			return {
				says: "Delete the call",
				act: () => alterElement(picks, { sources: [call], fingerprint }),
			};
		};
		alterWaiters.set(id, ({ ok, owner, held }) => {
			if (!ok) {
				showRefusal({ frame: pick.frame, selector: pick.selector, refusal: GONE, asked });
				return;
			}
			// the element's file may be a shared definition's; whether the change
			// lands there or at a call site in this frame's own file is the daemon's
			// to say, so its readers are held now and let go if they did not (#318)
			const read = heldRead;
			const readers = read?.source === source ? (read.shared?.frames ?? []) : [];
			holdReaders(pick.frame, readers);
			void writeElement(deps().project, pick.frame, {
				act: "delete",
				sources: [...at.sources],
				fingerprint: at.fingerprint,
				...(at.item === undefined ? {} : { item: at.item }),
			}).then((written) => {
				settled(written, {
					frame: pick.frame,
					selector: pick.selector,
					readers,
					edit: id,
					readAt: () => source,
					refuse: (refusal) => refuse(refusal, insteadDeleteCall(refusal, owner)),
					failed: "the change did not reach the file",
					// the elements are gone: the parent of the first is what the
					// hand holds now, and it holds it only once the write has
					// actually landed, so a refusal still has them to sit under
					...(picks.length === 1 ? {} : { entry: { picks: picks.map((held) => held.selector) } }),
					onLanded: () => {
						// what the frame held on screen for the answer goes now
						if (held === true) restoreWords(pick.frame, id, "after", () => {});
						holdParent(gone);
					},
				});
			});
		});
		target.postMessage(
			alterMessage(
				id,
				at.item === undefined ? picks.map((held) => held.selector) : [gone.selector],
				"delete",
				// a row's stamp draws every row, and the row alone goes (#324)
				at.item === undefined ? at.sources : [],
			),
			"*",
		);
		setTimeout(() => {
			if (alterWaiters.delete(id)) {
				showRefusal({ frame: pick.frame, selector: pick.selector, refusal: GONE, asked });
			}
		}, PICK_REPLY_MS);
	};

	/**
	 * ⌫ on a held element (#317): it goes, here and in the file.
	 *
	 * The fingerprint is the one the selection's read holds for this very element, which
	 * is the file the document on screen was rendered from. Without it there is
	 * nothing to measure the write against, and the honest answer is to say so
	 * rather than to write against whatever the file says now.
	 */
	const deleteElement = (picks: readonly PickedSelection[]) => {
		const first = picks[0];
		if (first === undefined) return;
		const asked = deleteAsk(picks.map((held) => held.tag));
		const sources: string[] = [];
		for (const pick of picks) {
			const stamp = stampOf(pick);
			if (typeof stamp !== "string") {
				showRefusal({ frame: pick.frame, selector: pick.selector, refusal: stamp, asked });
				return;
			}
			sources.push(stamp);
		}
		// One write is one file and one fingerprint, which is what makes a
		// multi-pick delete one press of undo (#323). A selection spread over
		// two files would be two writes and two steps, so it says so instead
		// of quietly becoming them.
		const files = new Set(sources.map(stampPath));
		if (files.size > 1 || new Set(picks.map((pick) => pick.frame)).size > 1) {
			showRefusal({
				frame: first.frame,
				selector: first.selector,
				refusal: { code: "spread", says: "these are written in different files; delete them one at a time" },
				asked,
			});
			return;
		}
		const read = heldRead;
		const fingerprint = measured(
			read !== undefined && sources.includes(read.source)
				? read.fingerprint
				: fingerprintFor(first.frame, sources[0] ?? ""),
			() => deleteElement(picks),
			(refusal) => showRefusal({ frame: first.frame, selector: first.selector, refusal, asked }),
		);
		if (fingerprint === undefined) return;
		// One row of a list is the row, never the template (#324). The document
		// says which entry of which array the pick stands in; the write takes
		// that entry out of the array literal, wherever it is written, and the
		// file keeps the one JSX literal every row is drawn from. Without an
		// entry to name the lane refuses rather than quietly editing a
		// template that renders more than once.
		const row = picks.length === 1 ? first.item : undefined;
		const rowPrint = row === undefined ? undefined : fingerprintFor(first.frame, row.map);
		const item =
			row === undefined || rowPrint === undefined
				? undefined
				: { source: row.map, index: row.index, fingerprint: rowPrint };
		alterElement(picks, { sources, fingerprint, ...(item === undefined ? {} : { item }) });
	};

	// --- move (#340) --------------------------------------------------------------

	/** The next move waiting its turn, once the one before it has settled. */
	const nextMove = () => {
		clearTimeout(moveRun.timer);
		moveRun.busy = false;
		moveRun.queue.shift()?.();
	};
	/** A move has begun: later ones wait, and a document that never answers holds none of them for long. */
	const claimMove = () => {
		moveRun.busy = true;
		clearTimeout(moveRun.timer);
		moveRun.timer = setTimeout(nextMove, HOLD_PAINT_MS);
	};

	/**
	 * One move, in the file and then in the document (#340).
	 *
	 * The file goes first, because only the planner knows whether the sibling
	 * on screen is one the file writes beside it; a refusal leaves the page
	 * untouched and sits under the element. Once the file has taken it the
	 * frame moves the very node, so the document held in front of the reload
	 * already shows the new order, and the ring follows the element there. The
	 * reload behind it is what puts the stamps right, and the ring is read off
	 * the new document once it has loaded.
	 *
	 * A row of a list moves as its entry in the array. An element that is the
	 * whole of what a component returns carries the call that renders it, and
	 * the lane moves the call.
	 */
	const moveBeside = (subject: PickedSelection, beside: PickedHit, place: MovePlace) => {
		const frame = subject.frame;
		claimMove();
		const asked = moveAsk(subject.tag, place, beside.tag);
		const refuse = (refusal: Refusal) => {
			nextMove();
			// the file moved under the last move's answer, so it says nothing now
			if (refusal.code === "stale-file") handPrints.clear();
			const stamped = stampOf(subject);
			showRefusal({
				frame,
				selector: subject.selector,
				refusal,
				asked,
				...refusedIn(refusal, typeof stamped === "string" ? stamped : undefined),
			});
		};
		const stamp = stampOf(subject);
		if (typeof stamp !== "string") {
			refuse(stamp);
			return;
		}
		/** the file a stamp is in, as it was when the selection read it or the last move left it */
		const printOf = (stamped: string): string | undefined => {
			const read = heldRead;
			if (read?.source === stamped) return read.fingerprint;
			return handPrints.get(stampPath(stamped)) ?? fingerprintFor(frame, stamped);
		};
		const again = () => moveBeside(subject, beside, place);
		const fingerprint = measured(printOf(stamp), again, refuse);
		if (fingerprint === undefined) return;
		let ask: MoveAsk;
		const row = subject.item !== undefined && subject.item.selector === subject.selector ? subject.item : undefined;
		if (row !== undefined) {
			if (beside.item === undefined || beside.item.map !== row.map) {
				refuse({ code: "not-siblings", says: "the one next to it is not a row of this list; ask the agent" });
				return;
			}
			const rowPrint = measured(printOf(row.map), again, refuse);
			if (rowPrint === undefined) return;
			ask = {
				act: "move",
				sources: [stamp],
				fingerprint,
				place,
				item: { source: row.map, index: row.index, target: beside.item.index, fingerprint: rowPrint },
			};
		} else {
			const target = stampOf({ frame, ...beside });
			if (typeof target !== "string") {
				refuse(target);
				return;
			}
			const ownerPrint = subject.owner === undefined ? undefined : printOf(subject.owner);
			ask = {
				act: "move",
				sources: [stamp],
				fingerprint,
				place,
				target: { source: target, ...(beside.owner === undefined ? {} : { owner: beside.owner }) },
				...(subject.owner === undefined || ownerPrint === undefined
					? {}
					: { owner: { source: subject.owner, fingerprint: ownerPrint } }),
			};
		}
		setRefused(null);
		const read = heldRead;
		const readers = read?.source === stamp ? (read.shared?.frames ?? []) : [];
		holdReaders(frame, readers);
		const d = deps();
		const id = ++d.pickSeq.current;
		void writeElement(d.project, frame, ask).then((written) => {
			const settle = (movedTo: string | undefined, chain: PickedHit[] | undefined) =>
				settled(written, {
					frame,
					selector: subject.selector,
					readers,
					edit: id,
					readAt: () => stamp,
					refuse,
					failed: "the move did not reach the file",
					...(movedTo === undefined ? {} : { entry: { movedTo } }),
					onLanded: () => {
						const now = deps();
						const moved = chain?.[chain.length - 1];
						if (chain === undefined || moved === undefined) {
							now.holdFrame(frame);
							now.whenLoaded(frame, nextMove);
							return;
						}
						// the ring stays on the element where it went, and is read
						// again off the reloaded document, stamps and all
						now.holdChain({ frame, chain });
						now.setSelected([]);
						now.setPicked([{ frame, ...moved }]);
						now.whenLoaded(frame, () => {
							deps().walkKin(frame, moved.selector, "self", () => deps().holdFrame(frame));
							nextMove();
						});
					},
				});
			if (written?.ok !== true) {
				settle(undefined, undefined);
				return;
			}
			// the element already stood there as the file has it: no step
			if (wroteNothing(written.undo)) {
				releaseReaders(frame, readers);
				nextMove();
				return;
			}
			const target = deps().iframes.current.get(frame)?.contentWindow;
			if (target == null) {
				settle(undefined, undefined);
				return;
			}
			alterWaiters.set(id, ({ ok, chain }) => {
				const moved = ok ? chain?.[chain.length - 1] : undefined;
				settle(moved?.selector, ok ? chain : undefined);
			});
			target.postMessage(moveMessage(id, subject.selector, beside.selector, place), "*");
			setTimeout(() => {
				if (alterWaiters.delete(id)) settle(undefined, undefined);
			}, PICK_REPLY_MS);
		});
	};

	/**
	 * The arrow keys on a held element (#340): one step among its siblings,
	 * earlier for ↑ and ←, later for ↓ and →. The frame names the siblings as
	 * they stand now; the end of the row is as far as a step goes. Each press
	 * is one write and one step of undo, and a press made while a move is
	 * still settling waits its turn.
	 */
	const moveStep = (step: -1 | 1): boolean => {
		const d = deps();
		const { store } = d;
		if (store.get().entered !== null || store.get().editing !== null) return false;
		const picks = store.get().picked;
		const first = picks[0];
		if (first === undefined) return false;
		if (moveRun.busy) {
			if (moveRun.queue.length < 8) moveRun.queue.push(() => moveStep(step));
			return true;
		}
		// the last move's turn can run out before its reload has loaded, and
		// a document still booting names no siblings: the press waits for it,
		// once, and one that never loads takes it nowhere
		if (d.reloading.current.has(first.frame)) {
			d.whenLoaded(first.frame, () => {
				if (!deps().reloading.current.has(first.frame)) moveStep(step);
			});
			return true;
		}
		if (picks.length > 1) {
			showRefusal({
				frame: first.frame,
				selector: first.selector,
				refusal: { code: "several", says: "move one element at a time" },
				asked: `Move ${picks.length} elements`,
			});
			return true;
		}
		claimMove();
		d.askFrame(
			first.frame,
			d.generationWaiters.current,
			(id) => familyMessage(first.selector, "siblings", id),
			({ hits }) => {
				const at = hits.findIndex((hit) => hit.selector === first.selector);
				const own = hits[at];
				const beside = hits[at + step];
				// the end of the row: there is nowhere further to go
				if (own === undefined || beside === undefined) {
					nextMove();
					return;
				}
				moveBeside({ frame: first.frame, ...own }, beside, step > 0 ? "after" : "before");
			},
			nextMove,
		);
		return true;
	};

	/** Nothing holds an edit past the window it was drawn in. */
	const dispose = () => {
		clearTimeout(openTimer);
		clearTimeout(closeTimer);
	};

	return {
		noteRead,
		readSettled,
		showRefusal,
		endEdit,
		beginTextEdit,
		openElement,
		openHeld,
		openAt,
		openWords,
		finishEdit,
		deleteElement,
		moveBeside,
		moveStep,
		walkHand,
		restored,
		altered,
		dispose,
	};
}

export type HandEditLane = ReturnType<typeof createHandEdit>;

/**
 * The edit lane as the canvas holds it: one lane for the canvas's life, its
 * gestures stable, reading the canvas as it was last drawn; and the refusal
 * it is showing, which goes when the selection moves or after `REFUSAL_MS`.
 */
export function useHandEdit(deps: HandEditDeps): HandEditLane & { refused: ShownRefusal | null } {
	const depsRef = useRef(deps);
	depsRef.current = deps;
	const [refused, setRefused] = useState<ShownRefusal | null>(null);
	const [lane] = useState(() => createHandEdit(() => depsRef.current, setRefused));

	// A refusal is about the element it was refused on, so it goes when the
	// selection moves rather than sitting over whatever comes next. The keys
	// rather than the array: a click on the element already held re-picks it
	// and hands back a fresh list, and that is the selection standing still.
	const pickedKeys = deps.picked.map((pick) => pickKey(pick.frame, pick.selector)).join("\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies(pickedKeys): the selection moving is the whole trigger
	useEffect(() => {
		setRefused(null);
	}, [pickedKeys]);
	// and it goes by itself after a moment (#339): a note, not a state
	useEffect(() => {
		if (refused === null) return;
		const timer = setTimeout(() => setRefused(null), REFUSAL_MS);
		return () => clearTimeout(timer);
	}, [refused]);
	useEffect(() => lane.dispose, [lane]);

	return { ...lane, refused };
}
