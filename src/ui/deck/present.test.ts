import { afterEach, expect, it, vi } from "vitest";
import { TALK_NAME } from "../../deck/present-wire";
import {
	fillScreen,
	pointerForRoom,
	pointerShown,
	presentDeck,
	presentDone,
	presentKeyFrom,
	roomScreens,
	roomWindowAt,
	showPointer,
} from "./present";
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

it("has the Mac app's window full screen once the page has the screen's size, which the slide waits for before it flies", async () => {
	const frames: Array<() => void> = [];
	const page = {
		innerWidth: 1440,
		innerHeight: 877,
		screen: { width: 1512, height: 982 },
		spoolCanvasWindow: { onCommand() {}, setCanvasActive() {}, presentFullScreen: async () => true },
	};
	vi.stubGlobal("window", page);
	vi.stubGlobal("requestAnimationFrame", (frame: () => void) => frames.push(frame));
	let full = false;
	void fillScreen(true).then(() => {
		full = true;
	});
	const frame = async () => {
		await new Promise((done) => setTimeout(done));
		for (const one of frames.splice(0)) one();
		await new Promise((done) => setTimeout(done));
	};

	// the window changing size draws a frame at a size on the way
	await frame();
	page.innerWidth = 1442;
	page.innerHeight = 879;
	await frame();
	expect(full).toBe(false);
	page.innerWidth = 1512;
	page.innerHeight = 982;
	await frame();
	expect(full).toBe(true);
});

it("shows the room the pointer until Show pointer is turned off, and then tells it nowhere", () => {
	const at = { x: 0.25, y: 0.5, down: false, colour: 0, taps: 0 };
	expect(pointerShown()).toBe(true);
	expect(pointerForRoom(at, pointerShown())).toEqual(at);
	showPointer(false);
	expect(pointerShown()).toBe(false);
	expect(pointerForRoom(at, pointerShown())).toBeNull();
	showPointer(true);
	expect(pointerForRoom(at, pointerShown())).toEqual(at);
});

it("lists the room's two screens in a fixed order, the other named once a swap has shown it", () => {
	expect(roomScreens(["Studio Display"], "Studio Display", true)).toEqual(["Studio Display", "other screen"]);
	expect(roomScreens(["Studio Display", "MacBook Pro"], "MacBook Pro", true)).toEqual([
		"Studio Display",
		"MacBook Pro",
	]);
	expect(roomScreens(["Studio Display", "MacBook Pro"], "Studio Display", true)).toEqual([
		"Studio Display",
		"MacBook Pro",
	]);
	// the room a window, or one display: no list
	expect(roomScreens(["Studio Display"], null, true)).toBeNull();
	expect(roomScreens([], "Studio Display", false)).toBeNull();
});
