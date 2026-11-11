import { afterEach, expect, it, vi } from "vitest";
import { TALK_NAME } from "../../deck/present-wire";
import { presentDeck, presentDone, presentKeyFrom, roomWindowAt } from "./present";
import { presenterLayout } from "./presenter-layout";

afterEach(() => {
	presentDone();
	vi.unstubAllGlobals();
});

it("opens nothing with the experiment off, and on, the room's window as the room of a fresh talk, one talk at a time", () => {
	const open = vi.fn(() => null);
	const from = { project: "kaffe", page: "talk", slide: "talk/sense" };
	vi.stubGlobal("window", { open, __SPOOL_EXPERIMENTS__: [] });
	presentDeck(from, "other");
	expect(open).not.toHaveBeenCalled();

	vi.stubGlobal("window", { open, __SPOOL_EXPERIMENTS__: ["deck"] });
	// one display: the slides fill the screen, with no room
	presentDeck(from);
	expect(open).not.toHaveBeenCalled();
	presentDone();
	// the other way, the presenter view: its room opens
	presentDeck(from, "other");
	presentDeck({ ...from, slide: "talk/title" }, "other");
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

it("opens the room's window beside spool's when there is room, and otherwise over the presenter's own slide alone", () => {
	const screen = { x: 0, y: 25, w: 1512, h: 957 };
	// spool's window on the left of the screen: the room beside it, centred on it, as wide as the room there allows
	expect(roomWindowAt({ x: 0, y: 25, w: 900, h: 957 }, screen)).toEqual({ x: 900, y: 332, w: 612, h: 344 });
	expect(roomWindowAt({ x: 552, y: 100, w: 960, h: 700 }, screen)).toEqual({ x: 0, y: 295, w: 552, h: 311 });

	// spool's window filling the screen: the room lies over the slide, which shows what the room shows already, and
	// leaves the head, what comes next, the notes and the bar in sight
	for (const view of [screen, { x: 0, y: 25, w: 1280, h: 775 }, { x: 0, y: 25, w: 2560, h: 1415 }]) {
		const room = roomWindowAt(view, screen);
		const slide = presenterLayout(view, { w: 16, h: 9 }).slide;
		expect(room.x).toBeGreaterThanOrEqual(view.x + slide.x);
		expect(room.y).toBeGreaterThanOrEqual(view.y + slide.y);
		expect(room.x + room.w).toBeLessThanOrEqual(view.x + slide.x + slide.w + 1);
		expect(room.y + room.h).toBeLessThanOrEqual(view.y + slide.y + slide.h + 1);
		expect(room.w / room.h).toBeCloseTo(16 / 9, 1);
	}
});
