import { expect, it } from "vitest";
import { presentKeyFrom } from "./present";

const talk = ["talk/title", "talk/sense", "talk/close"];
const held = (frames: string[], elements = 0) => ({ frames, elements });

it("presents from the slide held on ⌘↵ and from the first on ⇧⌘↵, and leaves ⌘↵ to the canvas over anything else", () => {
	expect(presentKeyFrom(talk, held(["talk/sense"]), false)).toBe("talk/sense");
	expect(presentKeyFrom(talk, held([]), false)).toBe("talk/title");
	expect(presentKeyFrom(talk, held(["talk/sense"]), true)).toBe("talk/title");
	expect(presentKeyFrom(talk, held(["talk/loose"], 0), true)).toBe("talk/title");
	// a loose frame, two slides, an element held: ⌘↵ is the canvas's own
	expect(presentKeyFrom(talk, held(["talk/loose"]), false)).toBeUndefined();
	expect(presentKeyFrom(talk, held(["talk/title", "talk/sense"]), false)).toBeUndefined();
	expect(presentKeyFrom(talk, held(["talk/sense"], 1), false)).toBeUndefined();
	// a talk with no slides presents nothing
	expect(presentKeyFrom([], held([]), true)).toBeUndefined();
});
