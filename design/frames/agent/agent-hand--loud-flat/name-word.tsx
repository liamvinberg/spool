import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../shared/lib/utils";

/**
 * The word, set the way a person reads, on the row the frame's own name is already on.
 *
 * `agent-hand--plate` turned the word on its side and the arithmetic was correct: a
 * horizontal chip needs 55.3px of clear field and the gutter between two frames at this
 * zoom is 44. Every frame after it inherited the rotation. **The mistake was not the
 * arithmetic, it was taking the gutter as the only address the canvas has.**
 *
 * ## The 44px, solved by leaving
 *
 * `src/ui/canvas/frame-label.tsx` draws a frame's name in a row that is
 * `frameWidth * k` wide and then counter-scaled by `1 / k`, so its final screen width
 * equals the frame's and its type never changes size however far out the canvas is
 * zoomed. That row already carries a second occupant: when a frame is selected, `play`
 * sets at its far end in `font-mono text-2xs text-muted leading-3` with a `gap-1.5`
 * between them. **This word is that slot, taken by the agent instead of by the human**,
 * in the same font, the same size and the same gap.
 *
 * What that buys, in order of how much it matters:
 *
 * **It is the only channel in the compile that survives a zoom.** The thread, the lane,
 * the node and the `shot` corners are all geometry on a canvas: zoom out and they
 * shrink with the frame until the wall between two frames is a few pixels and there is
 * nowhere to stand. The name row does not shrink, because the shipped label already
 * counter-scales it. `agent-hand--ghost-loud` found that the ladder was the only channel
 * that survived the *camera*; this is its sibling, and the two are the only ones that
 * survive anything.
 *
 * **The gutter goes back to the walk graph.** With the plate off the wall the widest
 * occupant is a slack thread at centre ± 5 against the lane's 5, so the stand-off falls
 * from the compile's forced **15 to 12**, and the assembly's reach from 23 of the 44px
 * gutter to **16.5 — 37.5% of it rather than 52%**. Cut the lane and it is 10.5, which
 * is 24%.
 *
 * **The opaque box stops standing on the outgoing walk edge.** `spool-play-field.tsx`
 * starts an edge at `x + w + 3`, `ROW_1 + 158`, and the compile's plate is a filled
 * `bg-canvas` box that covered **15.79px of that edge's 44.42px open and 11.88 shut**.
 * The presence node alone covers **9.06px, always the same 9.06**. Measured on the
 * curve rather than on the bounding boxes.
 *
 * ## What it costs, and the residual it cannot pay
 *
 * **A word six pixels from a name, in the same font, can be read as part of the name.**
 * That is the one fair accusation and there is no arrangement that answers it outright.
 * What answers it partly is that the name sets at `text-xs` in `text-text` and the word
 * at `text-2xs` in `text-muted` until a call opens, which is the same two-size,
 * two-ink separation the shipped label already uses to keep `play` from reading as part
 * of `home`. Stated rather than defended: at a glance, before either is read, `home
 * edit ×6` is one string.
 *
 * **The node still stands on the walk edge, and a bigger stand-off makes it worse.**
 * 9.06px of 44.42 is 20% of that edge hidden. The compile blamed opacity; the real
 * reason is that the presence welds at the frame's vertical centre and the edge departs
 * 6.5px above it, so they share an anchor. The edge travels right as it falls, which
 * means pushing the presence further out pushes it further *into* the edge rather than
 * clear of it.
 *
 * ## Which end of the row, decided by a measurement rather than by taste
 *
 * The far end is where `play` goes and it is the obvious place: it aligns the word's
 * right edge with the frame's own right edge and puts 79px of clear row between the two
 * strings. **It collides with the `shot` corners.** A corner's arc is struck concentric
 * with the frame's 12px radius, so the top-right arm runs from `x + w - RADIUS - ARM`
 * to the corner — x 439 to 474 on `home` — at `ROW_1 - OUT`, y 34, and the name row's
 * 12px line box runs y 29 to 41. Right-aligned, `edit ×6` sets from x 418.7 to 462 and
 * the arm crosses it. Set after the name it runs x 345.7 to 389 and clears the arm's
 * own end at 333 by **12.7px**.
 *
 * The second reason is smaller and holds anyway: left-aligned, a climbing count grows
 * to the right and the verb never moves, so `edit` stays fixed for the whole run.
 * Right-aligned, every new digit shifts the verb left.
 *
 * ## The bound, which is the corner rather than the gutter
 *
 * The word may run until it reaches that top-right arm, which is 23px in from the
 * frame's right edge: `152 - 29.68 - 6 - 23` is **93.3px, fifteen characters** at
 * Fragment Mono's 6.183px advance at 10px. The vocabulary is closed at `label()` —
 * seven verbs, `write` the longest at five — so the widest string it can ever produce
 * short of a six-figure run is `write ×100000` at thirteen. **The bound exists, it is
 * structural, and nothing reaches it.**
 *
 * That is the whole of why going horizontal changes the parent's cut order. The compile
 * cut the count first, because a count breaks the plate's one structural guarantee:
 * `write` is 30.9px so the plate is 38 forever, and `edit ×6` wants 51, `edit ×13` 56,
 * a hundred-write run 63. There is no plate here and no guarantee to break — the word
 * is a text run in a flex row whose other occupant already truncates, which is #184's
 * shipped rule for the model name against the stop. **The count is free.**
 */

/* ---------- the row's own type, measured in this frame's boot ---------- */

/** Fragment Mono's advance at 10px, which is what the word sets in */
const MONO_2XS = 6.183;
/** and at 12px, which is what the name sets in — `--presence` and `--label` both state 7.06 and are 5% out */
const MONO_XS = 7.42;
/** `gap-1.5`, the same gap `frame-label.tsx` puts between the name and `play` */
const GAP = 6;
/** how many characters of the frame's own name have to survive before the word is dropped instead */
const NAME_MIN = 4;

/**
 * Whether the row can hold the word.
 *
 * The name truncates and the word does not, so without a rule the word would eat the
 * name down to nothing at a small enough zoom. `edit ×6` wants `4 × 7.42 + 6 + 43.28`,
 * which is **78.96 drawn pixels**; the canvas draws a frame at 152 here, so it fits
 * with 73 to spare and would go on fitting down to a frame drawn 79px wide. That is far
 * below `LIVE_MIN_CSS_PX`, so the word is one of the two channels that still says
 * something in the regime where the frame is a stored still.
 */
export function wordFits(drawn: number, word: string): boolean {
	return drawn >= NAME_MIN * MONO_XS + GAP + word.length * MONO_2XS;
}

/** a digit rolling: how far along its own reading direction it travels */
const ROLL = 5;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * The word, on the name row, with the count climbing inside it.
 *
 * The offset is a construction rather than a calculation: an invisible copy of the
 * frame's own name sits in the same flex row, in the same classes `spool-play-field.tsx`
 * sets the real one in, so the word lands exactly where the name ends whatever the name
 * is and whatever the row is worth. Nothing measures anything at runtime, and a longer
 * name pushes the word rather than overlapping it.
 *
 * **The verb cuts and the count rolls**, `agent-hand--ghost-word`'s rule and its
 * mechanism unchanged. One verb replacing another is two different facts, and two words
 * crossfading at 10px are two words on top of each other, so the text is swapped in one
 * commit under a stable key. A count replacing itself is the same fact one larger, so
 * the old digit leaves along the reading direction and the new one arrives behind it,
 * at 160ms against the 573ms shortest gap between two writes. The roll's code is
 * `--ghost-word`'s to the character; all that changed is that its local x is now the
 * screen's, so the digit that used to travel up the wall travels along the line.
 *
 * **The word is held after its call lands rather than dropped.** `--ghost-word`
 * measured what dropping costs against this capture: 15.15 seconds of blank in sixteen
 * separate holes, the shortest 6ms and the longest 2.24s. On a wall that is a flicker;
 * on a row that is otherwise static chrome it is worse, because the eye is already
 * parked there reading the name. So the row says what the agent last did to this frame,
 * and drops to `text-muted` while it is a receipt rather than a live claim.
 */
export function NameWord({
	frame,
	left,
	top,
	width,
	word,
	count,
	live,
	still,
}: {
	frame: string;
	left: number;
	top: number;
	width: number;
	word: string;
	count: number;
	live: boolean;
	still: boolean;
}) {
	return (
		<motion.div
			className="absolute flex items-center gap-1.5"
			style={{ left, top, width, height: 22 }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: still ? 0 : 0.22, ease: ARRIVE }}
		>
			{/* the frame's own name, drawn invisibly in the classes the field draws it in, so
			    the word's left edge is the name's right edge by construction */}
			<span className="invisible min-w-0 truncate font-mono text-xs leading-3" aria-hidden="true">
				{frame}
			</span>
			<span
				className={cn(
					"shrink-0 whitespace-nowrap font-mono text-2xs leading-3",
					still ? null : "transition-colors duration-200",
					live ? "text-text" : "text-muted",
				)}
			>
				{word}
				{count > 1 ? (
					<>
						{" ×"}
						<span className="relative inline-block">
							{/* an in-flow copy holds the box and the baseline, so the rolling digits can be
							    absolute and the string never reflows under them */}
							<span className="invisible">{count}</span>
							<AnimatePresence initial={false}>
								<motion.span
									key={count}
									className="absolute inset-0"
									initial={{ opacity: 0, x: -ROLL }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: ROLL }}
									transition={{ duration: still ? 0 : 0.16, ease: ARRIVE }}
								>
									{count}
								</motion.span>
							</AnimatePresence>
						</span>
					</>
				) : null}
			</span>
		</motion.div>
	);
}
