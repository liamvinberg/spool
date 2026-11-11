import { afterEach, expect, it, vi } from "vitest";
import { TALK_NAME } from "../../deck/present-wire";
import { presentDeck, presentDone, presentKeyFrom } from "./present";

afterEach(() => {
	presentDone();
	vi.unstubAllGlobals();
});

it("opens nothing with the experiment off, and on, the room's window as the room of a fresh talk, one talk at a time", () => {
	const open = vi.fn(() => null);
	const from = { project: "kaffe", page: "talk", slide: "talk/sense" };
	vi.stubGlobal("window", { open, __SPOOL_EXPERIMENTS__: [] });
	presentDeck(from);
	expect(open).not.toHaveBeenCalled();

	vi.stubGlobal("window", { open, __SPOOL_EXPERIMENTS__: ["deck"] });
	presentDeck(from);
	presentDeck({ ...from, slide: "talk/title" });
	expect(open).toHaveBeenCalledTimes(1);
	const [address] = open.mock.calls[0] as unknown as [string];
	const url = new URL(address, "http://spool");
	expect(url.pathname).toBe("/play/kaffe");
	expect(url.searchParams.get("deck")).toBe("talk");
	expect(url.searchParams.get("frame")).toBe("talk/sense");
	expect(url.searchParams.get("room")).toMatch(TALK_NAME);
});

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
