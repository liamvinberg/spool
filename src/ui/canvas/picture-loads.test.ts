// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import type { LoaderAsk, LoaderReply } from "./picture-loader";
import { type Job, type LoaderFactory, StillLoads } from "./picture-loads";
import { Priority } from "./picture-plan";

/** Two stand-in loaders that keep what they were sent and answer when told. */
function loaders() {
	const sent: LoaderAsk[] = [];
	const listeners: ((event: MessageEvent<LoaderReply>) => void)[] = [];
	const make: LoaderFactory = () => ({
		postMessage: (asks: LoaderAsk[]) => sent.push(...asks),
		addEventListener: (_type: string, listener: unknown) =>
			listeners.push(listener as (event: MessageEvent<LoaderReply>) => void),
		terminate: () => undefined,
	});
	// one loader answers, as the one the still was sent to would
	const answer = (reply: LoaderReply) => listeners[0]?.({ data: reply } as MessageEvent<LoaderReply>);
	return { make, sent, answer };
}

const square = (still: string): Job => ({ key: still, still, halving: null, priority: Priority.page });

describe("StillLoads", () => {
	it("keeps a load asked again out when the older ask's drop comes back late", () => {
		const { make, answer } = loaders();
		const gone = vi.fn();
		const loads = new StillLoads({ landed: () => undefined, gone }, make);
		loads.start();
		const first = square("/covers/p/a/1");
		loads.ask(first);
		loads.cancel(first.key);
		// released and wanted again before the loader answered the first ask
		const again = square("/covers/p/a/1");
		loads.ask(again);
		answer({ key: first.key, generation: 0, ask: first.ask ?? 0, dropped: true });
		expect(gone).not.toHaveBeenCalled();
		expect(loads.job(first.key)).toBe(again);
		answer({ key: again.key, generation: 0, ask: again.ask ?? 0, dropped: true });
		expect(gone).toHaveBeenCalledWith(again, false);
		expect(loads.job(first.key)).toBeUndefined();
	});

	it("tells the layer a load dropped before it started is gone, so it can be asked again", () => {
		const { make, answer, sent } = loaders();
		const gone = vi.fn();
		const loads = new StillLoads({ landed: () => undefined, gone }, make);
		loads.start();
		const halving: Job = {
			key: "/covers/p/a/1#400",
			still: "/covers/p/a/1",
			halving: { width: 400, height: 267 },
			priority: Priority.drawn,
		};
		loads.ask(halving);
		loads.cancel(halving.key);
		loads.send();
		expect(sent.map((ask) => ask.kind)).toEqual(["load", "cancel"]);
		answer({ key: halving.key, generation: 0, ask: halving.ask ?? 0, dropped: true });
		expect(gone).toHaveBeenCalledWith(halving, false);
		expect(loads.pending.out).toBe(0);
	});

	it("lets a load taken back after it started land all the same", () => {
		const { make, answer } = loaders();
		const landed = vi.fn();
		const loads = new StillLoads({ landed, gone: () => undefined }, make);
		loads.start();
		const job = square("/covers/p/a/1");
		loads.ask(job);
		loads.cancel(job.key);
		const bitmap = { close: vi.fn(), width: 64, height: 64 } as unknown as ImageBitmap;
		answer({
			key: job.key,
			generation: 0,
			ask: job.ask ?? 0,
			bitmap,
			natural: { width: 800, height: 533 },
			fetchedAt: performance.timeOrigin,
		});
		expect(landed).toHaveBeenCalledOnce();
		expect(loads.take()?.job).toBe(job);
		expect(bitmap.close).not.toHaveBeenCalled();
	});
});
