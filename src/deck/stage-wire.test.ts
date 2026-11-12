import { expect, it } from "vitest";
import { type SlideReadiness, stageChange, tooHeavyAhead } from "./stage-wire";

it("takes a new build for a change to the talk's code, reads the talk again for its deck, and ignores the rest", () => {
	const talk = ["talk/title", "talk/words"];
	const heard = (change: unknown) => stageChange(change, talk, "talk");
	expect(heard({ kind: "frame", frame: "talk/words" })).toBe("build");
	expect(heard({ kind: "shared", frames: ["other/x", "talk/title"] })).toBe("build");
	// a shared file the link graph could not place may be any slide's
	expect(heard({ kind: "shared" })).toBe("build");
	expect(heard({ kind: "deck", page: "talk" })).toBe("talk");
	expect(heard({ kind: "geometry", frame: "talk/title" })).toBe("talk");
	expect(
		[
			{ kind: "frame", frame: "talk/loose" },
			{ kind: "shared", frames: ["other/x"] },
			{ kind: "deck", page: "other" },
			{ kind: "geometry", frame: "other/x" },
			{ kind: "thumb", frame: "talk/title" },
			null,
		].map(heard),
	).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
});

it("names a slide the room cannot ready ahead beside the one before it, by the WebGL contexts the two draw with", () => {
	const slides: SlideReadiness[] = [
		{ frame: "talk/title", status: "ready" },
		{ frame: "talk/chart", status: "ready", webgl: 4 },
		{ frame: "talk/map", status: "ready", webgl: 3 },
		{ frame: "talk/end", status: "loading" },
	];
	expect([...tooHeavyAhead(slides, 6)]).toEqual([["talk/map", 3]]);
});
