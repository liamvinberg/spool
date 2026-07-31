/**
 * What changed in a frame, asked as a question about rectangles.
 *
 * The whole of this direction rests on one restriction, and it is the restriction
 * the product actually has. Spool cannot ask a frame where an edit landed: the
 * iframe is sandboxed without `allow-same-origin`, so nothing reads its DOM from
 * outside, and a `str_replace` names a byte range in a source file, which is not a
 * place on a rendered page. What does cross the boundary is a list of boxes, and
 * an edit reboots the document, so every box on the far side of the reboot is a
 * fresh element with no relation to the one before it.
 *
 * So there is no identity, there are two unordered sets of rectangles, and the
 * only question they can answer is which rectangles in the second set are not in
 * the first. Everything below is that question made precise.
 *
 * **Position is deliberately thrown away.** In a flow layout a change to one block
 * moves every block under it, so a rule that noticed movement would light the whole
 * lower half of a page for a two-word edit at the top. Moving is what happens *to*
 * boxes; it is not what the agent did. The cost is stated rather than hidden: two
 * blocks swapping places keep their sizes and this reports nothing.
 *
 * **One tolerance does two jobs.** `slack` is how far apart two rectangles may be
 * and still be the same rectangle, and it is also the smallest change worth
 * drawing. Those are the same number because they are the same question — below it,
 * nobody can see the difference, so calling it a match and calling it invisible are
 * the same call.
 */

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * What became of one box in the second set.
 *
 *   carried  both sides held, within slack: nothing to say about it
 *   grown    one side held and the other moved: the same box, a different size
 *   arrived  nothing in the first set is plausibly this box at all
 *
 * `grown` and `arrived` are both news and both get drawn the same way. They are
 * told apart for one purpose only: when news is nested inside news, which of the
 * two the eye should be sent to.
 */
export type Fate = "carried" | "grown" | "arrived";

/** how far apart two boxes' centres are, for choosing between equally good matches */
function apart(a: Box, b: Box): number {
	return Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) + Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
}

/**
 * Match the second set against the first, one to one, and say what became of each.
 *
 * Two passes, and the order of them is what makes a list work. Adding a fourth row
 * to a list of three gives four rectangles that are all the same size: the exact
 * pass hands three of them their partners and the fourth is left without one, which
 * is the correct reading and is only reachable because matching is one to one.
 * A pass that matched on similarity alone would have paired all four and reported
 * nothing.
 *
 * Within a pass, `after` is walked in document order, so an ancestor claims its
 * partner before its descendants do. That is what keeps a hero image that gained a
 * full-bleed child from reading as the hero having been replaced.
 *
 * **The failure mode is a collision, and it is measured rather than assumed.** Two
 * unrelated boxes that happen to render the same size can take each other's seats:
 * on write 6 of `agent-hand--bloom`, a new `Röda dagar` at 26x8 claimed the footer
 * address's 26x8, and the footer was then the box with nothing left to match, so it
 * reported as new when nobody had touched it. One false arrival in seventeen across
 * that page's thirteen writes. Identity would prevent it and there is no identity;
 * what makes it survivable is that a collision can only happen between boxes that
 * look alike, so the wrong answer is always the same size as the right one.
 */
export function fates(before: readonly Box[], after: readonly Box[], slack: number): readonly Fate[] {
	const taken = new Array<boolean>(before.length).fill(false);
	const fate = new Array<Fate>(after.length).fill("arrived");

	const claim = (box: Box, fits: (candidate: Box) => boolean): boolean => {
		let best = -1;
		let closest = Number.POSITIVE_INFINITY;
		for (let index = 0; index < before.length; index += 1) {
			const candidate = before[index];
			if (taken[index] || candidate === undefined || !fits(candidate)) continue;
			const distance = apart(box, candidate);
			if (distance < closest) {
				closest = distance;
				best = index;
			}
		}
		if (best === -1) return false;
		taken[best] = true;
		return true;
	};

	// both sides held: this box is the box it was
	for (let index = 0; index < after.length; index += 1) {
		const box = after[index];
		if (box === undefined) continue;
		if (claim(box, (was) => Math.abs(was.w - box.w) < slack && Math.abs(was.h - box.h) < slack)) {
			fate[index] = "carried";
		}
	}

	// one side held: the same box at a different size
	for (let index = 0; index < after.length; index += 1) {
		const box = after[index];
		if (box === undefined || fate[index] === "carried") continue;
		if (claim(box, (was) => Math.abs(was.w - box.w) < slack || Math.abs(was.h - box.h) < slack)) {
			fate[index] = "grown";
		}
	}

	return fate;
}

/**
 * Which boxes are worth drawing an arrival on.
 *
 * Two rules on top of the match, and both of them are about not saying more than
 * happened.
 *
 * **A box has to be big enough to see.** `floor` is in screen pixels, not in the
 * frame's own units, because the question it answers is whether a person could tell
 * — so zooming the canvas out raises the bar in the design's coordinates, and far
 * enough out nothing qualifies at all, which is right.
 *
 * **News inside news is drawn once.** A list whose height grew because a row was
 * added is not news; the row is. So an `arrived` box silences the news above it,
 * and a `grown` box is silenced by any news below it. What is left is the smallest
 * true statement about what happened: the outermost thing that is genuinely new,
 * or, when nothing is new, the innermost thing that changed size.
 */
export function news(after: readonly Box[], fate: readonly Fate[], contains: (a: number, b: number) => boolean, floor: number): readonly number[] {
	const seen = after
		.map((box, index) => ({ box, index }))
		.filter(({ box, index }) => fate[index] !== "carried" && box.w >= floor && box.h >= floor)
		.map(({ index }) => index);

	return seen.filter((index) => {
		for (const other of seen) {
			if (other === index) continue;
			// an ancestor that is genuinely new owns the whole of what is inside it
			if (contains(other, index) && fate[other] === "arrived") return false;
			// a box that only changed size, holding something that is news, is the container
			if (contains(index, other) && fate[index] === "grown") return false;
		}
		return true;
	});
}
