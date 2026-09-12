/**
 * The words as the engine was already drawing them (#324).
 *
 * Opening an edit puts `contenteditable` on the element, and Chromium's rule
 * for that attribute forces `white-space: pre-wrap` — a declaration no inline
 * style overrides. Under `pre-wrap` every run of whitespace the file wrote is
 * drawn, so a line break in the source becomes a line break on screen and a
 * heading that was one line tall opens as three. The element's box must not
 * move when the caret arrives, so it is handed the collapsed words it was
 * already showing before the attribute goes on, and `pre-wrap` is left with
 * nothing to reflow. The snapshot the edit took holds what was there, and the
 * file's own bytes are what a commit writes.
 *
 * Pure over the element's text nodes in document order, because that is all
 * the rule needs: `white-space: normal` collapses each run of whitespace to
 * one space, drops the one that would begin the first run or end the last, and
 * never draws two in a row across the join between two runs.
 *
 * The shim carries a copy of this function, interpolated into its source, so
 * the rule is written and tested once.
 */
export function collapsedWords(values: readonly string[]): string[] {
	const runs = values.map((value) => value.replace(/\s+/g, " "));
	for (let at = 1; at < runs.length; at += 1) {
		const before = runs[at - 1] ?? "";
		const here = runs[at] ?? "";
		if (before.endsWith(" ") && here.startsWith(" ")) runs[at] = here.slice(1);
	}
	const first = runs.findIndex((run) => run !== "");
	if (first !== -1) runs[first] = (runs[first] ?? "").replace(/^ /, "");
	let last = -1;
	for (let at = runs.length - 1; at >= 0; at -= 1) {
		if (runs[at] !== "") {
			last = at;
			break;
		}
	}
	if (last !== -1) runs[last] = (runs[last] ?? "").replace(/ $/, "");
	return runs;
}
