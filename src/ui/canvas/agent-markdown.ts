/**
 * The markdown subset an agent message is actually made of (#148, #192).
 *
 * The agent writes markdown because its own surface is a terminal that renders
 * it. The rail has to, or `**bold**` keeps its asterisks, a fence draws three
 * literal backticks mid-paragraph, and a numbered list is one grey paragraph.
 *
 * The subset is the corpus's, not CommonMark's. Measured over the thirty-five
 * messages in `fixtures/captures/` that reach a transcript: bold, inline code,
 * fenced blocks, blockquotes, ordered and unordered lists. **No heading appears
 * in any of them** — the only message with headings is a sub-agent's, which never
 * reaches the log — so `#` is not implemented rather than implemented and unused.
 *
 * Parsing lives here rather than in the renderer because it is pure: the same
 * chunks answer "what will this draw" for the streaming edge and for the settled
 * message, and nothing about them needs a document.
 */

export interface Span {
	readonly text: string;
	readonly code?: boolean;
	readonly bold?: boolean;
}

export type Chunk =
	| { readonly kind: "p" | "quote"; readonly spans: readonly Span[] }
	| { readonly kind: "item"; readonly marker: string; readonly spans: readonly Span[] }
	| { readonly kind: "fence"; readonly text: string };

/**
 * `**bold**` and `` `code` ``, in that order because they nest that way.
 *
 * The corpus decides the order: the long message's three findings are each a bold
 * lead-in with a path inside it — ``**1. Notion — no `kaffe-receipt-copy`.**`` —
 * so a single pass over both markers leaves the backticks sitting literal inside
 * the bold run. Code inside bold happens; bold inside code does not, and cannot,
 * since a code span is verbatim by definition.
 */
function spansOf(line: string): readonly Span[] {
	const spans: Span[] = [];
	const code = (text: string, bold: boolean) => {
		for (const piece of text.split(/(`[^`]+`)/g)) {
			if (piece === "") continue;
			const inline = piece.startsWith("`") && piece.endsWith("`") && piece.length > 2;
			spans.push({
				text: inline ? piece.slice(1, -1) : piece,
				...(inline ? { code: true } : {}),
				...(bold ? { bold: true } : {}),
			});
		}
	};
	for (const piece of line.split(/(\*\*[^*]+?\*\*)/g)) {
		if (piece === "") continue;
		const strong = piece.startsWith("**") && piece.endsWith("**") && piece.length > 4;
		code(strong ? piece.slice(2, -2) : piece, strong);
	}
	return spans;
}

export function chunksOf(text: string): readonly Chunk[] {
	const chunks: Chunk[] = [];
	const lines = text.split("\n");
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length > 0) chunks.push({ kind: "p", spans: spansOf(paragraph.join(" ")) });
		paragraph = [];
	};
	for (let at = 0; at < lines.length; at += 1) {
		const line = lines[at] ?? "";
		if (line.startsWith("```")) {
			flush();
			const body: string[] = [];
			for (at += 1; at < lines.length && !(lines[at] ?? "").startsWith("```"); at += 1) body.push(lines[at] ?? "");
			chunks.push({ kind: "fence", text: body.join("\n") });
			continue;
		}
		if (line.trim() === "") {
			flush();
			continue;
		}
		const bullet = /^\s*([-*])\s+(.*)$/.exec(line);
		const number = /^\s*(\d+)\.\s+(.*)$/.exec(line);
		if (bullet !== null || number !== null) {
			flush();
			chunks.push({
				kind: "item",
				marker: bullet !== null ? "•" : `${number?.[1]}.`,
				spans: spansOf(bullet?.[2] ?? number?.[2] ?? ""),
			});
			continue;
		}
		if (line.startsWith(">")) {
			flush();
			chunks.push({ kind: "quote", spans: spansOf(line.replace(/^>\s?/, "")) });
			continue;
		}
		paragraph.push(line.trim());
	}
	flush();
	return chunks;
}

/** every character the render will draw, in order, so a live tail can be found from the end */
export function drawnText(chunks: readonly Chunk[]): string {
	return chunks
		.map((chunk) => (chunk.kind === "fence" ? chunk.text : chunk.spans.map((span) => span.text).join("")))
		.join("");
}
