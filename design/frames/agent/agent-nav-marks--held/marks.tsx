import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * Candidate readings for a thread that has stopped and is waiting on a person (#161).
 *
 * **The object is not the one the ticket describes.** #161 says `orbit` is "the ring
 * around its glyph", which is `AgentOrbit` — the nav cell #144 drew and then deleted
 * along with the whole tab row. What actually ships in the threads strip is
 * `ThreadMark`: a bare 14px box with no glyph in it at all, holding a 9.2px ring, a
 * 5px disc, or nothing. So the ring is not around anything. It is the whole drawing,
 * which is *more* room to work with, not less.
 *
 * Every candidate here is the real `ThreadMark` geometry with one reading added, drawn
 * at the 14px it ships at, in the real 34px strip, with a 2.5× blow-up beside it.
 *
 * **One column on this sheet is a disqualifier rather than a comparison.** `reduced`
 * is what a `prefers-reduced-motion` user sees for a *working* thread: `ThreadMark`
 * drops the rotation and keeps the drawing, so the ring *and its arc* stand still.
 * Any candidate whose waiting cell matches that cell is not a state at all under
 * reduced motion — it is the working mark with a second meaning. That kills the first
 * instinct outright and it is a fact about the code, not a matter of taste.
 *
 * **The other constraint is the clearing rule, and it is what the strip is for.**
 * `unread` clears when you *open* the thread — `useDeck` does exactly that. Waiting
 * does not clear when you open it; the question is still unanswered and the thread
 * still cannot move. So a candidate that borrows the disc has to be special-cased out
 * of the one transition the disc exists for, and the moment it is special-cased it is
 * a third state wearing the second one's clothes.
 */

/** the four things a thread's mark has to be able to say, once waiting is one of them */
export type Cell = "read" | "working" | "waiting" | "unread";

export type Held = "same" | "still" | "ring" | "open" | "held" | "hollow" | "bar";

const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

/** the ring every state in this vocabulary is cut from: 9.2px across in a 14px box */
const R = 4.6;
/** circumference, so a gap can be stated as a length rather than guessed at */
const C = 2 * Math.PI * R;

/* ---------- the two readings that already ship ---------- */

/**
 * working — the ring at a quarter strength with a quarter arc over it, turning.
 *
 * `frozen` is not a style choice: it is what `useReducedMotion` already renders, and
 * the reason it is drawable here as its own cell is that every candidate has to be
 * told apart from it twice.
 */
function Working({ frozen }: { frozen: boolean }) {
	const still = useReducedMotion() === true || frozen;
	return (
		<motion.svg
			viewBox="0 0 14 14"
			className="h-3.5 w-3.5 text-text/60"
			fill="none"
			aria-hidden="true"
			animate={still ? undefined : { rotate: 360 }}
			transition={still ? undefined : SPIN}
		>
			<circle cx="7" cy="7" r={R} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
			<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</motion.svg>
	);
}

/** unread — a 5px disc at text strength, the way a mailbox says it */
function Unread() {
	return <span className="h-[5px] w-[5px] rounded-full bg-text/85" />;
}

/* ---------- the candidates ---------- */

/**
 * Each of these is static by construction, because motion is spoken for: the rail
 * settled that state is motion and a turning thing is a thing that is working. A
 * waiting thread is the one state on the strip that is *certainly* burning nothing,
 * so it cannot move at all.
 */
function Candidate({ kind }: { kind: Held }) {
	switch (kind) {
		case "same":
			return <Unread />;
		case "still":
			return <Working frozen />;
		case "ring":
			// the working drawing with the one thing taken off it that means the agent is
			// moving. `StateMark` in the rail already draws this and already means at rest.
			return (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r={R} stroke="currentColor" strokeWidth="1.5" />
				</svg>
			);
		case "open":
			// a loop that has not closed, with the missing quarter left open. The gap is
			// stated as a length off the real circumference rather than eyeballed.
			return (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle
						cx="7"
						cy="7"
						r={R}
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeDasharray={`${C * 0.74} ${C * 0.26}`}
						transform="rotate(-115 7 7)"
					/>
				</svg>
			);
		case "held":
			// the winner, drawn by the real mark rather than copied into the sheet, so the
			// sheet cannot end up arguing for something the rail does not draw
			return <ThreadMark life="waiting" />;
		case "hollow":
			// unread's sibling rather than working's: the same 5px, outlined. Something to
			// answer against something to read, said at the size of the smaller one.
			return (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.4" />
				</svg>
			);
		case "bar":
			// the borrowed one, kept so it stays legible as a loss: two strokes is a media
			// player's pause, and nothing here was paused or can be resumed by a button.
			return (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<path d="M5.3 4.1v5.8M8.7 4.1v5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			);
	}
}

/**
 * The real mark, with one candidate substituted for the reading it does not have.
 *
 * The box is 14px whatever is in it, exactly as `ThreadMark` guarantees, so a mark
 * changing never moves the name beside it.
 */
export function StripMark({
	state,
	kind,
	frozen = false,
	scale = 1,
}: {
	state: Cell;
	kind: Held;
	/** draw as a reduced-motion user sees it */
	frozen?: boolean;
	scale?: number;
}) {
	const body =
		state === "read" ? null : state === "working" ? (
			<Working frozen={frozen} />
		) : state === "unread" ? (
			<Unread />
		) : (
			<Candidate kind={kind} />
		);
	if (scale === 1) {
		return <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{body}</span>;
	}
	return (
		<span className="flex shrink-0 items-center justify-center" style={{ width: 14 * scale, height: 14 * scale }}>
			<span
				className="flex h-3.5 w-3.5 items-center justify-center"
				style={{ transform: `scale(${scale})` }}
			>
				{body}
			</span>
		</span>
	);
}

/* ---------- the strip, at the width it ships at ---------- */

export interface Row {
	readonly id: string;
	readonly ask: string;
	readonly state: Cell;
}

/**
 * #136's strip, 420px wide and 34px tall, with the plus leading it and the fade at
 * the far end. Four threads in a strip that fits three is the honest case and it is
 * where a mark has to survive: a name at 112px, a mark beside it, and the one you
 * are reading at full strength while the rest are muted.
 *
 * It is a local copy rather than the real `ThreadStrip`, because `Life` has no
 * waiting reading yet and inventing one in `shared/` before the sheet is looked at
 * would be deciding this in the type rather than in the drawing.
 */
export function CandidateStrip({ rows, open, kind }: { rows: readonly Row[]; open: string; kind: Held }) {
	return (
		<div className="w-[420px] shrink-0 border-border border-x bg-bg">
			<div className="flex h-[34px] items-stretch border-border border-b">
				<span className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45">
					<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
						<path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
					</svg>
				</span>
				<div className="relative min-w-0 flex-1">
					<div className="flex h-full items-stretch gap-3 overflow-hidden px-3.5">
						{rows.map((row) => {
							const on = row.id === open;
							return (
								<span
									key={row.id}
									className="relative flex min-w-[112px] shrink-0 grow basis-0 items-center gap-2 text-left"
								>
									<StripMark state={row.state} kind={kind} />
									<span
										className={cn(
											"min-w-0 truncate font-mono text-sm leading-4",
											on ? "text-text" : "text-muted/70",
										)}
									>
										{row.ask}
									</span>
									{on ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
								</span>
							);
						})}
					</div>
					<span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
				</div>
			</div>
		</div>
	);
}
