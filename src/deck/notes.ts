/**
 * A slide's notes (spool#265): `notes.md` beside its `frame.tsx`, one paragraph per beat, in order, a blank line
 * between two. A beat with nothing to say is a paragraph of a lone `-`, so the beats after it keep their place.
 * Paragraphs beyond the slide's last beat show with the last beat. Read and written without touching a disk, so the
 * daemon and the window read the same bytes alike.
 */

export const NOTES_FILE = "notes.md";

/** What a beat with nothing to say is written as, between beats that have words. */
const SILENT = "-";

/** The file's paragraphs, in order: runs of blank lines are one break, and a lone `-` is a beat with no words. */
export function notesParagraphs(bytes: string | null): string[] {
	if (bytes === null) return [];
	const text = bytes.replace(/\r\n?/g, "\n").trim();
	if (text === "") return [];
	return text.split(/\n[ \t]*(?:\n[ \t]*)+/).map((paragraph) => {
		const words = paragraph.trim();
		return words === SILENT ? "" : words;
	});
}

/**
 * The notes of a slide of `beats` beats (at least one), by beat: the paragraphs beyond the last beat are the last
 * beat's too, a blank line between each. `extra` says there were more paragraphs than beats.
 */
export function notesByBeat(bytes: string | null, beats: number): { notes: string[]; extra: boolean } {
	const count = Math.max(1, beats);
	const paragraphs = notesParagraphs(bytes);
	const notes = Array.from({ length: count }, (_, beat) =>
		beat < count - 1 ? (paragraphs[beat] ?? "") : paragraphs.slice(beat).join("\n\n"),
	);
	return { notes, extra: paragraphs.length > count };
}

/**
 * The file after one beat's words are written, of a slide of `beats` beats: `null` when no beat has words left, so
 * the file goes. The words stay one paragraph: blank lines inside them close up. Writing the last beat replaces the
 * paragraphs beyond it too, since they read as its words; writing another leaves them be.
 */
export function withBeatNotes(bytes: string | null, beat: number, beats: number, words: string): string | null {
	const count = Math.max(1, beats, beat + 1);
	const paragraphs = notesParagraphs(bytes);
	const said = words
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== "")
		.join("\n")
		.trim();
	const next = [...paragraphs];
	while (next.length < beat) next.push("");
	if (beat === count - 1) next.splice(beat, next.length - beat, said);
	else next[beat] = said;
	while (next.length > 0 && next.at(-1) === "") next.pop();
	if (next.length === 0) return null;
	return `${next.map((paragraph) => (paragraph === "" ? SILENT : paragraph)).join("\n\n")}\n`;
}
