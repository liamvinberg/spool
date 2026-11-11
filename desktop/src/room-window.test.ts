import assert from "node:assert/strict";
import test from "node:test";
import { carryRect, type RoomDisplay, roomLost, roomPlace, roomTalk, swapPlaces } from "./room-window";

/** A laptop's own panel, with the menu bar off the top of its usable area. */
const LAPTOP: RoomDisplay = {
	id: 1,
	label: "Built-in Retina Display",
	internal: true,
	bounds: { x: 0, y: 0, width: 1512, height: 982 },
	workArea: { x: 0, y: 33, width: 1512, height: 949 },
};
/** A projector to the laptop's right. */
const PROJECTOR: RoomDisplay = {
	id: 2,
	label: "EPSON PJ",
	internal: false,
	bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
	workArea: { x: 1512, y: 25, width: 1920, height: 1055 },
};
/** A big monitor above the laptop. */
const STUDIO: RoomDisplay = {
	id: 3,
	label: "Studio Display",
	internal: false,
	bounds: { x: -500, y: -1440, width: 2560, height: 1440 },
	workArea: { x: -500, y: -1415, width: 2560, height: 1415 },
};

test("with two displays the room goes full screen on the one spool's window is not on, whichever that is", () => {
	assert.deepEqual(roomPlace([LAPTOP, PROJECTOR], LAPTOP.id), { kind: "screen", display: PROJECTOR });
	assert.deepEqual(roomPlace([LAPTOP, PROJECTOR], PROJECTOR.id), { kind: "screen", display: LAPTOP });
	// of several others, an external display before the laptop's own, and the largest of those
	assert.deepEqual(roomPlace([LAPTOP, PROJECTOR, STUDIO], PROJECTOR.id), { kind: "screen", display: STUDIO });
});

test("with one display the room opens beside spool's window, or over the presenter's own slide when it fills the screen", () => {
	// spool's window on the left half: the room beside it, centred on it
	const half = { x: 0, y: 33, w: 900, h: 949 };
	assert.deepEqual(roomPlace([LAPTOP], LAPTOP.id, half), { kind: "window", rect: { x: 900, y: 336, w: 612, h: 344 } });
	// spool's window filling the screen: over the slide alone, so the clock, what comes next, the notes, End and the
	// bar stay in sight
	const full = { x: 0, y: 33, w: 1512, h: 949 };
	const over = roomPlace([LAPTOP], LAPTOP.id, full);
	assert.deepEqual(over, { kind: "window", rect: { x: 96, y: 161, w: 960, h: 540 } });
	// never larger than the screen, nor off it
	const small = { ...LAPTOP, workArea: { x: 0, y: 25, width: 800, height: 600 } };
	assert.deepEqual(roomPlace([small], small.id), { kind: "window", rect: { x: 0, y: 100, w: 800, h: 450 } });
});

test("x trades the two screens, and a room that is a window goes full screen on the other display", () => {
	assert.deepEqual(swapPlaces([LAPTOP, PROJECTOR], LAPTOP.id, PROJECTOR.id), { room: LAPTOP, canvas: PROJECTOR });
	assert.deepEqual(swapPlaces([LAPTOP, PROJECTOR], LAPTOP.id, undefined), { room: PROJECTOR, canvas: undefined });
	assert.equal(swapPlaces([LAPTOP], LAPTOP.id, undefined), undefined);
});

test("spool's window carried to the other display keeps its place and is never larger than that display", () => {
	const rect = { x: 100, y: 133, w: 1200, h: 800 };
	assert.deepEqual(carryRect(rect, LAPTOP.workArea, PROJECTOR.workArea), { x: 1743, y: 196, w: 1200, h: 800 });
	const wide = { x: 0, y: 25, w: 1920, h: 1055 };
	assert.deepEqual(carryRect(wide, PROJECTOR.workArea, LAPTOP.workArea), { x: 0, y: 33, w: 1512, h: 949 });
});

test("unplugging the room's display, or the one spool's window was carried off, brings the room back as a window", () => {
	assert.equal(roomLost([LAPTOP], LAPTOP.id, PROJECTOR.id), true);
	assert.equal(roomLost([PROJECTOR], PROJECTOR.id, PROJECTOR.id), true);
	assert.equal(roomLost([LAPTOP, PROJECTOR, STUDIO], LAPTOP.id, PROJECTOR.id), false);
});

test("only a deck's room address opens a room, never an ordinary play window", () => {
	const talk = "a1B2c3D4e5F6g7H8i9J0kL";
	assert.equal(roomTalk(`http://127.0.0.1:7777/play/kaffe?deck=pitch&frame=pitch%2Ftitle&room=${talk}`), talk);
	assert.equal(roomTalk("http://127.0.0.1:7777/play/kaffe?frame=pitch%2Ftitle"), undefined);
	assert.equal(roomTalk("http://127.0.0.1:7777/play/kaffe?room=short"), undefined);
	assert.equal(roomTalk(`http://127.0.0.1:7777/api/p/kaffe?room=${talk}`), undefined);
});
