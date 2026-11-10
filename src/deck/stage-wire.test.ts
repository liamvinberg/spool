import { expect, it } from "vitest";
import { stageChange } from "./stage-wire";

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
