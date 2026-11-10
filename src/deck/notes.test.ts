import { describe, expect, it } from "vitest";
import { notesByBeat, withBeatNotes } from "./notes";

describe("a slide's notes", () => {
	it("reads one paragraph per beat, the rest with the last beat, and a lone dash as a beat with no words", () => {
		const bytes = "Hold the ring up.\r\nWait a beat.\n\n\n-\n  \nThen the price.\n\nThank the room.\n";
		expect(notesByBeat(bytes, 3)).toEqual({
			notes: ["Hold the ring up.\nWait a beat.", "", "Then the price.\n\nThank the room."],
			extra: true,
		});
		expect(notesByBeat(bytes, 5)).toEqual({
			notes: ["Hold the ring up.\nWait a beat.", "", "Then the price.", "Thank the room.", ""],
			extra: false,
		});
		// a slide that names no beats has one
		expect(notesByBeat(null, 0)).toEqual({ notes: [""], extra: false });
	});

	it("writes one beat's words where it reads them back, and no file once no beat has any", () => {
		const beats = 3;
		let bytes: string | null = null;
		bytes = withBeatNotes(bytes, 2, beats, "Then the price.\n\n\nAnd the date.");
		expect(bytes).toBe("-\n\n-\n\nThen the price.\nAnd the date.\n");
		bytes = withBeatNotes(bytes, 0, beats, "  Hold the ring up.  ");
		expect(notesByBeat(bytes, beats).notes).toEqual(["Hold the ring up.", "", "Then the price.\nAnd the date."]);
		// the last beat's words are all that read as its own, so writing it replaces what lay beyond
		expect(withBeatNotes("One.\n\nTwo.\n\nThree.\n", 1, 2, "Two again.")).toBe("One.\n\nTwo again.\n");
		expect(withBeatNotes("One.\n\nTwo.\n\nThree.\n", 0, 2, "Uno.")).toBe("Uno.\n\nTwo.\n\nThree.\n");
		bytes = withBeatNotes(bytes, 2, beats, "");
		expect(bytes).toBe("Hold the ring up.\n");
		expect(withBeatNotes(bytes, 0, beats, "\n")).toBeNull();
	});
});
