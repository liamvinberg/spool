import assert from "node:assert/strict";
import test from "node:test";
import {
	daemonIdentity,
	keepSpare,
	loadFailedForGood,
	POPUP_SIZE_WAIT_MS,
	popupPlaySize,
	type SpareFacts,
	type SpareSurroundings,
	shouldMakeSpare,
	spareForPlay,
} from "./play-spare";

const ORIGIN = "http://127.0.0.1:7777";
const DAEMON = daemonIdentity(ORIGIN, 4100);
const READY: SpareFacts = { origin: ORIGIN, daemon: DAEMON, ready: true };
const CANVAS: SpareSurroundings = {
	canvasOpen: true,
	daemon: DAEMON,
	remote: false,
	quitting: false,
	refusedBy: undefined,
	awaitingReveal: 0,
};

test("a press adopts a spare that has painted, on the play's origin and the daemon the canvas is on", () => {
	assert.equal(spareForPlay(READY, ORIGIN, DAEMON), "adopt");
});

test("a press makes its own window when there is no spare to adopt yet, and leaves a loading one be", () => {
	assert.equal(spareForPlay(undefined, ORIGIN, DAEMON), "fresh");
	assert.equal(spareForPlay({ ...READY, ready: false }, ORIGIN, DAEMON), "fresh");
});

test("a play on another origin, a remote project's, leaves the spare for the next local play", () => {
	assert.equal(spareForPlay(READY, "http://127.0.0.1:7768", DAEMON), "fresh");
});

test("a spare whose daemon restarted or went is thrown away, never shown", () => {
	assert.equal(spareForPlay(READY, ORIGIN, daemonIdentity(ORIGIN, 4200)), "discard");
	assert.equal(spareForPlay(READY, ORIGIN, undefined), "discard");
	// another port is another daemon, whatever its pid
	assert.notEqual(daemonIdentity(ORIGIN, 4100), daemonIdentity("http://127.0.0.1:7778", 4100));
});

test("a spare lives only while a canvas is open on this Mac's daemon that served it", () => {
	assert.equal(keepSpare(READY, CANVAS), true);
	// a play revealing its frame is no reason to drop the spare, only to wait before making the next
	assert.equal(keepSpare(READY, { ...CANVAS, awaitingReveal: 2 }), true);
	assert.equal(keepSpare(READY, { ...CANVAS, canvasOpen: false }), false);
	assert.equal(keepSpare(READY, { ...CANVAS, remote: true }), false);
	assert.equal(keepSpare(READY, { ...CANVAS, quitting: true }), false);
	assert.equal(keepSpare(READY, { ...CANVAS, daemon: daemonIdentity(ORIGIN, 4200) }), false);
});

test("the next spare is made with a canvas open and no play still bringing its frame up", () => {
	assert.equal(shouldMakeSpare(undefined, CANVAS), true);
	// one at most
	assert.equal(shouldMakeSpare(READY, CANVAS), false);
	// refilling never competes with a play
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, awaitingReveal: 1 }), false);
});

test("a play stops holding the next spare back only when its own page fails for good", () => {
	assert.equal(loadFailedForGood(-105, true), true);
	// a frame inside it, or a load another navigation replaced, leaves it on its way
	assert.equal(loadFailedForGood(-105, false), false);
	assert.equal(loadFailedForGood(-3, true), false);
});

test("no spare is made where none could be adopted, and none again from a daemon that refused its page", () => {
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, canvasOpen: false }), false);
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, remote: true }), false);
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, quitting: true }), false);
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, daemon: undefined }), false);
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, refusedBy: DAEMON }), false);
	// a newer daemon on the same address is asked again
	assert.equal(shouldMakeSpare(undefined, { ...CANVAS, refusedBy: daemonIdentity(ORIGIN, 4000) }), true);
});

test("a play from an older canvas waits for its size a moment at most, then opens at the unknown size", () => {
	const unknown = { w: 1440, h: 900 };
	const phone = { w: 390, h: 844 };
	assert.deepEqual(popupPlaySize(phone, 40, unknown), phone);
	assert.deepEqual(popupPlaySize(phone, POPUP_SIZE_WAIT_MS, unknown), phone);
	// an answer after the cap is too late to move a window already on screen
	assert.deepEqual(popupPlaySize(phone, POPUP_SIZE_WAIT_MS + 1, unknown), unknown);
	assert.deepEqual(popupPlaySize(undefined, 20, unknown), unknown);
});
