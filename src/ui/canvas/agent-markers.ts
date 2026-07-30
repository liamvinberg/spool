/**
 * Closing the markdown markers a streaming message has not finished writing
 * (#148, #192).
 *
 * Two things go wrong drawing half-arrived markdown, and both move the *block
 * structure* rather than the text:
 *
 * **A partial marker is a block.** `\n\n*` is a paragraph containing one
 * asterisk: a gap plus a line, 28px. The very next character makes it `\n\n**`,
 * an unclosed marker — so an implementation that holds unclosed markers back
 * deletes that paragraph again. In the longest captured message that happens at
 * four bold lead-ins and at two fences, so the block pumps in and out six times
 * and everything below it moves twice each time. The same is true of a nascent
 * fence, which spends one frame as a paragraph of two backticks, and of a nascent
 * *closing* fence, which spends one frame as an extra body line inside the block
 * it is about to end.
 *
 * **And holding back lurches when it lets go.** ``**1. Notion — no
 * `kaffe-receipt-copy`.**`` is 38 characters that would all appear in the single
 * frame the closing `**` lands.
 *
 * Closing instead has neither failure. An unclosed `**` gets a `**`, an unclosed
 * backtick gets a backtick, an unterminated fence gets a fence — so the run
 * renders as bold, or code, or a code block, from its first character and simply
 * grows. When the real close arrives the output is byte-identical to what was
 * already on screen, so there is nothing to reflow.
 *
 * An opener with nothing after it is dropped rather than closed, because `****`
 * is not bold and an empty code span is a chip with padding and no text in it.
 *
 * **A nascent list marker is the same shape and was the last one left.** A line
 * holding only `-`, `*` or `1.` is a paragraph whose one character *leaves* the
 * drawn text the moment the space after it makes it a marker — the only remaining
 * place where what is on screen is not a prefix of what will be. It matters more
 * than 16px: it is the one case that can re-key a block and remount every word
 * inside it. So the nascent marker waits for its space, exactly as a nascent fence
 * waits for its third backtick.
 *
 * Every rule here was found by walking the repo's streamed messages one character
 * at a time — 5,808 characters — through a height model of the blocks the
 * renderer draws, and requiring that the height never decreases and that the
 * finished text comes back byte-identical. Holding markers back scored 8
 * decreases, worst 28px. Drawing them raw scored 2. This scores 0.
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
		// `--` waits with them, because its third dash makes it a rule.
		if (/^\s*(?:[-*]|\d+\.|--)$/.test(tail)) return head;
		tail = holdLink(tail);
		// a trailing run of marker characters cannot mean anything yet. Two backticks are
		// either an empty code span or the first two thirds of a fence, and one tilde is
		// half of anything; both are a block for one frame.
		tail = tail
			.replace(/\*{3,}$/, "")
			.replace(/`{2,}$/, "")
			.replace(/(?<!~)~$/, "");
		if ((tail.match(/`/g) ?? []).length % 2 === 1) tail = tail.endsWith("`") ? tail.slice(0, -1) : `${tail}\``;
		if ((tail.match(/~~/g) ?? []).length % 2 === 1) tail = tail.endsWith("~~") ? tail.slice(0, -2) : `${tail}~~`;
		tail = closeStars(tail);
	}

	return head + tail;
}

/**
 * A link that has not finished arriving waits, because its own syntax is not text.
 *
 * This is the second case in the file where a drawn character *leaves* again, and it
 * is worse than the nascent list marker: `[the frame](spool.page)` draws `the frame`,
 * so the brackets, the parentheses and the whole URL are characters on screen that
 * the closing `)` deletes. Twenty-two of them in the longest plausible link.
 *
 * So an unfinished link is held from its `[`, and the test is what makes it cheap: a
 * bracket is only *unfinished* while it could still become a link. `[a]` with nothing
 * yet after it could; `[a] and` could not, because the character after the close is
 * not a `(`, and prose full of brackets is left alone from the frame that settles it.
 *
 * It also happens to answer the task box for free. `- [` and `- [ ]` are the same
 * shape — a bracket that might close into something whose syntax is not text — so
 * they wait here rather than needing a rule of their own.
 */
function holdLink(tail: string): string {
	const open = tail.lastIndexOf("[");
	if (open < 0) return tail;
	const rest = tail.slice(open);
	if (/^\[[^\]\n]*\]\([^()\s]*\)/.test(rest)) return tail;
	// still open, or closed and pointing at a `(` that has not shut: either way it may
	// still become a link, so none of it is text yet
	if (/^\[[^\]\n]*(\](\([^()\s]*)?)?$/.test(rest)) return tail.slice(0, open);
	return tail;
}

/**
 * The asterisks, balanced as the two markers they now are.
 *
 * Bold alone could be counted, because `**` is unambiguous. Italic cannot be counted
 * beside it: `**a**` holds four asterisks and no emphasis, and the rule this replaced
 * — drop a trailing `*` that is not a `**` — deleted the *closing* asterisk of every
 * finished `*run*` the moment italic became a marker at all.
 *
 * So the run is walked instead, longest marker first, and each is closed or dropped on
 * the file's own rule: an opener with nothing behind it is dropped, because `**` is not
 * bold and `*` is not emphasis, and anything with a character in it is closed so it
 * renders from that character and simply grows. Inner closes before outer.
 */
function closeStars(tail: string): string {
	let bold = -1;
	let italic = -1;
	for (let at = 0; at < tail.length; ) {
		if (tail[at] === "*" && tail[at + 1] === "*") {
			bold = bold === -1 ? at : -1;
			at += 2;
		} else if (tail[at] === "*") {
			italic = italic === -1 ? at : -1;
			at += 1;
		} else at += 1;
	}
	let out = tail;
	if (italic >= 0) out = italic === out.length - 1 ? out.slice(0, italic) : `${out}*`;
	if (bold >= 0) out = bold === tail.length - 2 ? out.slice(0, bold) : `${out}**`;
	return out;
}
