import assert from "node:assert/strict";
import test from "node:test";
import { isPlayMark, playTiming } from "./play-timing";

test("a play's line puts every mark after its press, once, the first of each name counting", () => {
	const timing = playTiming("spare", 1_000);
	assert.equal(timing.mark("window-shown", 1_012.4), false);
	assert.equal(timing.mark("shell-painted", 1_180), false);
	assert.equal(timing.mark("window-shown", 1_500), false);
	assert.equal(timing.mark("frame-revealed", 1_420), true);
	assert.equal(timing.line(), "spare window-shown=12ms shell-painted=180ms frame-revealed=420ms");
	assert.equal(timing.line(), undefined);
});

test("a window closed before its frame showed says how far it got", () => {
	const timing = playTiming("fresh", 0);
	timing.mark("window-shown", 30);
	assert.equal(timing.line(), "fresh window-shown=30ms shell-painted=- frame-revealed=-");
});

test("only the four marks are marks", () => {
	assert.equal(isPlayMark("frame-revealed"), true);
	assert.equal(isPlayMark("press"), true);
	assert.equal(isPlayMark("reset"), false);
	assert.equal(isPlayMark(3), false);
});
