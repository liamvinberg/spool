import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * The ghost, and the handle it leaves behind.
 *
 * The mechanism is `agent-hand--ghost`'s and is not re-argued: two whole renders of
 * the same component at two revisions, the older drawn over the newer at a hard 0.3
 * cap, letting them cancel everywhere the write did not reach. No diff, no box, no
 * source map. What is new here is the clock and the handle.
 *
 * **The clock changed and it changed both of the parent's numbers.** The parent
 * stepped once per write, so it drew thirteen ghosts of one write each and capped
 * itself at 573ms because that was the shortest gap between two writes. On the
 * photograph clock — `errand.ts` — thirteen writes make three pictures, at 14.5s,
 * 26.8s and 35.4s, and each one carries a whole run of six, four and three writes.
 * Rendered at the canvas's own 152×329 at device scale 2 and diffed against its
 * predecessor, counting pixels more than 8/255 apart, the three land at **31.56%,
 * 32.46% and 14.00%** of the rectangle. So the ceiling went away and the volume went
 * up, in the same move.
 *
 * **Which is why the hold goes to zero rather than up.** The parent's 140ms of flat
 * 0.3 existed to make the peak a state rather than a crossing. A third of the frame
 * doubled and held still is not a state, it is a broken re-render, and holding it is
 * the one thing that turns this direction into the bug it keeps being accused of
 * being. Every millisecond here moves.
 *
 * **580ms, and the floor is what derives it.** 180ms is still the floor and still
 * `frame-shell.tsx:136-144`, the cover fade that measures how long a reboot's seam
 * lasts — but it is a floor on the *perceived* ghost, not on the timeline, and the
 * parent met it by holding flat for 140 and then leaving. With the hold deleted the
 * only way left to meet it is a leave whose visible portion is itself 180ms. The
 * curve sheds most of the 0.3 inside its first third, so the leave has to be
 * 180 ÷ 0.32 = 562ms for the ghost to still be worth the seam it covers. **580.**
 * Thirty-eight percent longer than the parent, and none of it standing still.
 *
 * **The arithmetic that kills a longer automatic ghost, which is what this frame was
 * sent to test.** Three pictures land in 37.7 seconds. At 580ms each, something is
 * over the frame for 1.74s of the turn: a glance arriving at one uniformly random
 * instant catches a ghost **4.6%** of the time. Take it to two full seconds, the top
 * of the range this round was asked to try, and that becomes 15.9% — still five
 * misses in six, and now with a third of the frame doubled and parked on screen for
 * two seconds, which is long enough to read it, disbelieve it, and file it. **Duration
 * cannot buy attention.** What you are fighting is a ratio of ghost to cadence, the
 * cadence is twelve seconds, and no number that is still legible as a transition
 * moves that ratio anywhere useful. So the automatic ghost stays short and the thing
 * that waits for you is not the ghost.
 *
 * **The tab.** When a picture lands, the frame keeps a short stub on its bottom wall.
 * Press and hold it and the previous photograph comes back at the same 0.3 cap, for
 * exactly as long as you hold it, whenever you ask — during the turn, or twenty
 * seconds after it ended. Release and it goes. The stub is the presence's own grip
 * rotated onto the one wall nothing else in this family uses, at the same 6px
 * stand-off, so it needs no new vocabulary and it cannot be a selection ring.
 *
 * **Two strengths, one object, which is the presence's trick again.** The tab sits at
 * 0.38 while there is a picture you have not asked about, drops to 0.13 once you
 * have, and goes to 0.85 while you are holding it. So the same mark answers *there
 * is a previous state* — always true, always askable — and *something landed while
 * you were elsewhere*, and the second answer clears on an act rather than on a guess.
 * That is the whole reply to waiting for attention: a pointer crossing a frame is not
 * a person looking at it, and pressing a handle is.
 *
 * **What it costs.** One photograph back, always, so it is the *newest* photograph's
 * predecessor rather than the one you last saw: two pictures landing unwatched and
 * the first is gone. That matters less than it sounds like it should, and the
 * measurement is why — the whole turn, revision 0 against revision 13, differs by
 * 32.70% of the rectangle, and the middle photograph alone differs by 32.46%. One
 * picture back is already almost all of what the whole turn did, because a turn
 * rewrites the same regions rather than spreading across new ones. And the tab is a
 * second object on a canvas whose whole argument has been that the agent is one
 * object; it is the smallest one that could carry a press, and it is still one more.
 */

/** the old render's ceiling, inherited and not re-argued */
const PEAK = 0.3;

/**
 * The automatic ghost: all leave, no hold. 580 rather than 420 because the hold went
 * to zero and the perceived length still has to clear the 180ms seam.
 */
export const LEAVE_MS = 580;

/** out fast, then a tail nobody can see: most of the 0.3 is shed in the first third */
const LEAVE = [0.33, 1, 0.68, 1] as const;

/** the held ghost arriving, at the speed the presence's chip arrives */
const TAKE_MS = 100;
/** and leaving at `frame-shell.tsx`'s own cover fade, because a release is a curtain */
const SEAM_MS = 180;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** what is over the frame right now, and whether it put itself there */
export interface Over {
	readonly kind: "auto" | "held";
	readonly rev: number;
	readonly key: string;
}

export interface Hold {
	/** the ghost on top of the frame, or nothing */
	readonly over: Over | null;
	/** there is a previous photograph to ask for, so the tab exists */
	readonly has: boolean;
	/** the newest picture has been asked about, so the tab is quiet */
	readonly taken: boolean;
	readonly press: () => void;
	readonly release: () => void;
}

/**
 * The ghost's whole life: it plays once when a picture lands, and it comes back for
 * as long as you hold the tab.
 *
 * Only ever a step forward. A replay drops the revision to zero in one commit, and a
 * ghost of the finished design over the found one is the entire frame doubled — the
 * rendering fault this direction is accused of being, drawn on purpose at the one
 * moment nobody wrote anything.
 *
 * Under `prefers-reduced-motion` the automatic half is gone and the held half is not.
 * That is the honest split rather than a degrade: an automatic ghost is a timeline
 * and a held one is a gesture, and stillness has an objection to the first and none
 * to the second. In this frame the turn also jump-cuts, so no picture ever lands
 * one at a time and there is nothing for the tab to be about either. In the product
 * there would be, and the tab would work.
 */
export function useHold(rev: number): Hold {
	const still = useReducedMotion() === true;
	const [auto, setAuto] = useState<{ rev: number; key: number } | null>(null);
	const [back, setBack] = useState<number | null>(null);
	const [taken, setTaken] = useState(true);
	const [held, setHeld] = useState(false);
	const last = useRef(rev);

	useEffect(() => {
		const before = last.current;
		last.current = rev;
		if (rev <= before) {
			// a replay, or the frame as found: nothing has been replaced, so there is
			// nothing to be a ghost of and nothing to hold
			setAuto(null);
			setBack(null);
			setTaken(true);
			setHeld(false);
			return;
		}
		setBack(before);
		setTaken(false);
		if (still) return;
		setAuto({ rev: before, key: rev });
		const timer = window.setTimeout(() => setAuto(null), LEAVE_MS);
		return () => window.clearTimeout(timer);
	}, [rev, still]);

	const press = useCallback(() => {
		// taking it cancels whatever was playing itself, so two are never stacked
		setAuto(null);
		setTaken(true);
		setHeld(true);
	}, []);
	const release = useCallback(() => setHeld(false), []);

	const over: Over | null =
		held && back !== null
			? { kind: "held", rev: back, key: "held" }
			: auto === null
				? null
				: { kind: "auto", rev: auto.rev, key: `auto-${auto.key}` };

	return { over, has: back !== null, taken, press, release };
}

/**
 * The frame, with what it replaced still over it.
 *
 * The current render is the frame — opaque, in the flow, exactly what the canvas
 * would draw with nobody anywhere near it. The ghost is a sibling on top and touches
 * nothing: no filter, no colour, no border. It is the design's own previous state in
 * the design's own colours, which is why this direction spends no accent.
 */
export function Ghosted({
	rev,
	over,
	draw,
}: {
	rev: number;
	over: Over | null;
	draw: (rev: number) => ReactNode;
}) {
	const still = useReducedMotion() === true;
	const auto = over?.kind === "auto";
	return (
		<div className="relative h-full w-full">
			{draw(rev)}
			<AnimatePresence>
				{over === null ? null : (
					<motion.div
						key={over.key}
						className="pointer-events-none absolute inset-0"
						initial={{ opacity: auto ? PEAK : 0 }}
						animate={{
							opacity: auto ? 0 : PEAK,
							transition: auto
								? { duration: LEAVE_MS / 1000, ease: LEAVE }
								: { duration: still ? 0 : TAKE_MS / 1000, ease: ARRIVE },
						}}
						// letting go is a curtain rather than a statement, so it borrows the
						// curtain's own number: `frame-shell.tsx` fades a cover out over 180ms
						exit={{ opacity: 0, transition: { duration: still ? 0 : SEAM_MS / 1000, ease: ARRIVE } }}
						aria-hidden="true"
					>
						{draw(over.rev)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so the tab is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the stub starts where the wall stops curving */
const RADIUS = 12;

/** the presence's stand-off, shared so the two objects sit on one ring */
const OUT = 6;
/** the grip's own thickness, rotated onto the bottom wall */
const BAR_H = 3;
const BAR_W = 20;
/** what a finger and a canvas at 39% need, around a 20x3 mark */
const HIT_W = 40;
const HIT_H = 18;

/** nothing to ask about yet is no mark; unread, read, and held are the three states */
const UNREAD = 0.38;
const READ = 0.13;
const HELD = 0.85;

/**
 * The tab, on the one wall this family has never used.
 *
 * The presence lives on a side wall and the frame's name lives above it, so the
 * bottom is the only edge free at every moment of the turn — including the stretch
 * where the grip is the wall's whole 329px height. Sitting at the presence's own 6px
 * stand-off puts the two objects on one ring around the frame, which is what stops
 * this reading as a second system.
 *
 * It is not a ring, a dot or a badge. A dot is a notification and this is a handle:
 * the shape says the thing you do to it, and what you do is hold it.
 */
export function HoldTab({
	index,
	hold,
}: {
	index: number;
	hold: Hold;
}) {
	const still = useReducedMotion() === true;
	const [down, setDown] = useState(false);
	const box = { x: COLS[index] ?? 0, y: ROW_1 };
	const left = box.x + RADIUS;
	const top = box.y + FH + OUT;

	const grab = () => {
		setDown(true);
		hold.press();
	};
	const drop = () => {
		if (!down) return;
		setDown(false);
		hold.release();
	};

	return (
		<div className="pointer-events-none absolute inset-0 z-20">
			<AnimatePresence>
				{hold.has ? (
					<motion.button
						key="tab"
						type="button"
						aria-label="hold to show the previous revision"
						className="pointer-events-auto absolute flex items-center justify-start"
						style={{ left: left - (HIT_W - BAR_W) / 2, top: top - (HIT_H - BAR_H) / 2, width: HIT_W, height: HIT_H }}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: still ? 0 : SEAM_MS / 1000, ease: ARRIVE }}
						onPointerDown={grab}
						onPointerUp={drop}
						onPointerLeave={drop}
						onPointerCancel={drop}
						// the pointer is not the only way to hold something, and this is the one
						// gesture in the family that a person without one can still make
						onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
							if (event.key === " " || event.key === "Enter") grab();
						}}
						onKeyUp={(event: KeyboardEvent<HTMLButtonElement>) => {
							if (event.key === " " || event.key === "Enter") drop();
						}}
					>
						<motion.span
							className="block rounded-full bg-text"
							style={{ marginLeft: (HIT_W - BAR_W) / 2, width: BAR_W, height: BAR_H }}
							initial={false}
							animate={{ opacity: down ? HELD : hold.taken ? READ : UNREAD }}
							transition={{ duration: still ? 0 : TAKE_MS / 1000, ease: ARRIVE }}
						/>
					</motion.button>
				) : null}
			</AnimatePresence>
		</div>
	);
}
