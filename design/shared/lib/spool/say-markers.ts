/**
 * Closing the markdown markers a streaming message has not finished writing (#148).
 *
 * This is the whole of the streaming jitter, and it is pure string work, so it lives
 * here where it can be reasoned about without a renderer around it.
 *
 * Two things go wrong drawing half-arrived markdown, and both move the *block
 * structure* rather than the text:
 *
 * **A partial marker is a block.** `\n\n*` is a paragraph containing one asterisk: a
 * gap plus a line, 28px. The very next character makes it `\n\n**`, an unclosed
 * marker — so an implementation that holds unclosed markers back deletes that
 * paragraph again. In the 3,372-character message that happens at four bold lead-ins
 * and at two fences, so the block pumps in and out six times and everything below it
 * moves twice each time. The same is true of a nascent fence, which spends one frame
 * as a paragraph of two backticks, and of a nascent *closing* fence, which spends one
 * frame as an extra body line inside the block it is about to end.
 *
 * **And holding back lurches when it lets go.** `**1. Notion — no
 * \`kaffe-receipt-copy\`.**` is 38 characters that would all appear in the single frame
 * the closing `**` lands.
 *
 * Closing instead has neither failure. An unclosed `**` gets a `**`, an unclosed
 * backtick gets a backtick, an unterminated fence gets a fence — so the run renders as
 * bold, or code, or a code block, from its first character and simply grows. When the
 * real close arrives the output is byte-identical to what was already on screen, so
 * there is nothing to reflow.
 *
 * An opener with nothing after it is dropped rather than closed, because `****` is not
 * bold and an empty code span is a chip with padding and no text in it.
 *
 * **A nascent list marker is the same shape and was the last one left.** A line holding
 * only `-`, `*` or `1.` is a paragraph whose one character *leaves* the drawn text the
 * moment the space after it makes it a marker — the only remaining place where what is
 * on screen is not a prefix of what will be. It matters more than 16px: it is the one
 * case that can re-key a block and remount every word inside it. So the nascent marker
 * waits for its space, exactly as a nascent fence waits for its third backtick.
 *
 * **Measured, not asserted.** Every rule here was found by walking all three of the
 * repo's streamed messages one character at a time — 5,808 characters — through a
 * height model of the blocks `Said` draws, and requiring that the height never
 * decreases and that the finished text comes back byte-identical. Holding markers back
 * scored 8 decreases, worst 28px. Drawing them raw scored 2. This scores **0**, and the
 * last two it had to fix were subtle: a nascent *closing* fence spending one frame as an
 * extra body line, and a *completed* closing fence being eaten by the same rule that
 * strips a nascent one. `pnpm test` does not cover this, because vitest only includes
 * `src/**`, so the walk is a scratch script rather than a suite — which is why the
 * numbers are written down here instead.
 */

/** the opening fence that has not been closed yet, or -1 */
function openFence(lines: readonly string[]): number {
	let at = -1;
	lines.forEach((line, index) => {
		if (line.startsWith("```")) at = at === -1 ? index : -1;
	});
	return at;
}

export function closedText(text: string): string {
	const lines = text.split("\n");
	const fence = openFence(lines);
	if (fence >= 0) {
		/*
		 * Inside a fence the content is verbatim, so the only repair is to shut it — but
		 * two things have to come off the body first. A nascent closing fence spends a
		 * frame as a body line of one or two backticks, and a half-typed line spends a
		 * frame as an empty one; both vanish when the real close lands, and each is 16px.
		 * Only whole lines are touched, so the opening fence itself is never edited.
		 */
		const body = lines.slice(fence + 1);
		while (body.length > 0) {
			const last = body[body.length - 1] ?? "";
			if (last === "" || /^`{1,2}$/.test(last)) body.pop();
			else break;
		}
		return [...lines.slice(0, fence + 1), ...body, "```"].join("\n");
	}

	// the last line is the only place an inline marker can still be open: a paragraph
	// break closes one either way
	const cut = text.lastIndexOf("\n") + 1;
	const head = text.slice(0, cut);
	let tail = text.slice(cut);

	/*
	 * A fence delimiter reaches here exactly once — the frame its closing ``` completes,
	 * which balances the count and sends it down this branch instead of the one above.
	 * It is a real marker and must survive: stripping it as a run of backticks reopens
	 * the fence for one frame, which is the 16px pump this guard exists to stop.
	 */
	if (!tail.startsWith("```")) {
		// a line holding only `-`, `*` or `1.` is a nascent list marker: a paragraph whose
		// one character *leaves* the drawn text the moment its space arrives and promotes it
		// to a marker. It waits, exactly as a nascent fence waits for its third backtick.
		if (/^\s*(?:[-*]|\d+\.)$/.test(tail)) return head;
		// a trailing run of marker characters cannot mean anything yet. One asterisk is
		// not a marker; two backticks are either an empty code span or the first two
		// thirds of a fence, and both are a block for one frame.
		tail = tail.replace(/\*{3,}$/, "").replace(/`{2,}$/, "");
		if (tail.endsWith("*") && !tail.endsWith("**")) tail = tail.slice(0, -1);
		if ((tail.match(/`/g) ?? []).length % 2 === 1) tail = tail.endsWith("`") ? tail.slice(0, -1) : `${tail}\``;
		if ((tail.match(/\*\*/g) ?? []).length % 2 === 1) tail = tail.endsWith("**") ? tail.slice(0, -2) : `${tail}**`;
	}

	return head + tail;
}
