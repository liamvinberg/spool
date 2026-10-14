import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_HELD_MS, RECONNECT_MAX_MS, reconnectBackoff } from "./reconnect-backoff";

/** A random source that repeats, so a spread is the same on every run. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		return state / 2 ** 32;
	};
}

/** One connection's life on the fake clock: when it tried, and it drops or holds as the test says. */
function connection(random: () => number) {
	const backoff = reconnectBackoff({ random });
	const tries: number[] = [];
	const retry = () => setTimeout(() => tries.push(Date.now()), backoff.next());
	return { backoff, tries, retry };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
});
afterEach(() => {
	vi.useRealTimers();
});

describe("reconnectBackoff", () => {
	it("spreads a hundred connections dropped at once over more than a second, not the same instant", () => {
		const random = seeded(260);
		const all = Array.from({ length: 100 }, () => connection(random));
		for (const one of all) one.retry();
		vi.advanceTimersByTime(RECONNECT_MAX_MS);
		const at = all.map((one) => one.tries[0] as number).sort((a, b) => a - b);
		expect(at).toHaveLength(100);
		expect(at[0]).toBeGreaterThanOrEqual(1_000);
		expect((at[99] as number) - (at[0] as number)).toBeGreaterThan(800);
		// no tenth of a second takes more than a fifth of them
		for (let from = 0; from < 2_000; from += 100)
			expect(at.filter((t) => t >= from && t < from + 100).length).toBeLessThan(20);

		// the ones the overload drops again come back further apart still
		const again = all.map((one) => {
			one.backoff.connected();
			const dropped = Date.now();
			one.retry();
			return { one, dropped };
		});
		vi.advanceTimersByTime(RECONNECT_MAX_MS);
		const waits = again.map(({ one, dropped }) => (one.tries[1] as number) - dropped).sort((a, b) => a - b);
		expect((waits[99] as number) - (waits[0] as number)).toBeGreaterThan(1_600);
	});

	it("waits longer each time a connection drops within a minute of connecting, up to about 30 s", () => {
		for (const random of [() => 0, () => 0.999, seeded(1)]) {
			const backoff = reconnectBackoff({ random });
			const waits: number[] = [];
			for (let i = 0; i < 4; i++) {
				const wait = backoff.next();
				waits.push(wait);
				vi.advanceTimersByTime(wait);
				backoff.connected();
				vi.advanceTimersByTime(RECONNECT_HELD_MS - 1);
			}
			for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1] as number);
			expect(waits[3]).toBeGreaterThan(waits[0] as number);
			for (let i = 0; i < 10; i++) expect(backoff.next()).toBeLessThanOrEqual(RECONNECT_MAX_MS);
			expect(backoff.next()).toBeGreaterThanOrEqual(RECONNECT_MAX_MS / 2);
		}
	});

	it("keeps growing while tries fail without ever connecting", () => {
		const backoff = reconnectBackoff({ random: () => 0.5 });
		const waits = Array.from({ length: 4 }, () => backoff.next());
		expect(waits).toEqual([1_500, 3_000, 6_000, 12_000]);
	});

	it("starts again from about 1 s once a connection held a minute", () => {
		const backoff = reconnectBackoff({ random: () => 0.999 });
		for (let i = 0; i < 6; i++) backoff.next();
		expect(backoff.next()).toBeGreaterThan(20_000);
		backoff.connected();
		vi.advanceTimersByTime(RECONNECT_HELD_MS);
		const wait = backoff.next();
		expect(wait).toBeGreaterThanOrEqual(1_000);
		expect(wait).toBeLessThanOrEqual(2_000);
	});
});
