// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./source";

/** A WebSocket the test opens and drops by hand; every one made, with when. */
class FakeSocket extends EventTarget {
	static made: { socket: FakeSocket; at: number }[] = [];
	static readonly OPEN = 1;
	readyState = 0;
	constructor(readonly url: string) {
		super();
		FakeSocket.made.push({ socket: this, at: Date.now() });
	}
	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
	send() {
		// the keepalive is answered straight away, so a held socket never goes silent
		setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: "pong" })), 0);
	}
	close() {
		if (this.readyState === 3) return;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

const last = () => FakeSocket.made.at(-1) as { socket: FakeSocket; at: number };

/** The canvas's socket opens, holds for `held` ms, and drops: how long it waits before it tries again. */
function dropAfter(held: number): number {
	const count = FakeSocket.made.length;
	last().socket.open();
	vi.advanceTimersByTime(held);
	const dropped = Date.now();
	last().socket.close();
	while (FakeSocket.made.length === count) vi.advanceTimersByTime(100);
	return last().at - dropped;
}

beforeEach(() => {
	FakeSocket.made = [];
	vi.stubGlobal("WebSocket", FakeSocket);
	vi.useFakeTimers();
	vi.setSystemTime(0);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("the canvas's live socket", () => {
	it("comes back spread out when a hundred canvases drop at once", () => {
		const stops = Array.from({ length: 100 }, () => listen("/live", () => {}));
		const first = [...FakeSocket.made];
		for (const { socket } of first) socket.open();
		vi.advanceTimersByTime(1_000);
		for (const { socket } of first) socket.close();
		const dropped = Date.now();
		vi.advanceTimersByTime(2_000);
		const back = FakeSocket.made.slice(100).map(({ at }) => at - dropped);
		expect(back).toHaveLength(100);
		expect(Math.min(...back)).toBeGreaterThanOrEqual(1_000);
		expect(Math.max(...back) - Math.min(...back)).toBeGreaterThan(500);
		expect(new Set(back).size).toBeGreaterThan(50);
		for (const stop of stops) stop();
	});

	it("waits longer each time it drops within a minute, and about 1 s again once it held a minute", () => {
		const stop = listen("/live", () => {});
		const first = dropAfter(1_000);
		expect(first).toBeGreaterThanOrEqual(1_000);
		expect(first).toBeLessThanOrEqual(2_100);
		expect(dropAfter(30_000)).toBeGreaterThanOrEqual(2_000);
		expect(dropAfter(59_000)).toBeGreaterThanOrEqual(4_000);
		for (let i = 0; i < 4; i++) expect(dropAfter(1_000)).toBeLessThanOrEqual(30_100);
		const after = dropAfter(60_000);
		expect(after).toBeGreaterThanOrEqual(1_000);
		expect(after).toBeLessThanOrEqual(2_100);
		stop();
	});
});
