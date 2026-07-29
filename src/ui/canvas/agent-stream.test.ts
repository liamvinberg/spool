// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AgentEvent } from "../api";
import { type AgentTurn, useAgentTurn } from "./agent-stream";

/**
 * The hook that owns one turn (#192), on its own rather than under the canvas.
 *
 * Both of these are properties nothing else can see. The canvas re-renders for its
 * own reasons — a watcher event, a flows read, a frame waking — so a rail mounted
 * inside it picks up arriving events whether or not the hook asked for a render.
 * Here nothing else renders, so the tick is the only thing that can.
 */

function mount() {
	const seen: AgentTurn[] = [];
	let open = false;
	const encoder = new TextEncoder();
	let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;

	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			const stream = new ReadableStream<Uint8Array>({
				start: (controller) => {
					ctrl = controller;
				},
			});
			open = true;
			return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
		}),
	);

	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		if (open) ctrl?.close();
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});

	function Probe() {
		seen.push(useAgentTurn("test"));
		return null;
	}

	return {
		latest: () => seen[seen.length - 1] as AgentTurn,
		push: (event: AgentEvent) => ctrl?.enqueue(encoder.encode(`event: agent\ndata: ${JSON.stringify(event)}\n\n`)),
		close: () => {
			open = false;
			ctrl?.close();
		},
		render: async () => {
			await act(async () => {
				root.render(createElement(Probe));
			});
		},
	};
}

async function settle(ms: number) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

const still = () =>
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query.includes("prefers-reduced-motion"),
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));

const waiting: AgentEvent = { kind: "waiting", parent: null };
const speaking: AgentEvent = { kind: "speaking", message: "m", model: "opus", parent: null };
const ended: AgentEvent = { kind: "ended", ending: "done", reason: "completed", stopReason: null, parent: null };
const closed: AgentEvent = { kind: "closed", code: 0, parent: null };

describe("useAgentTurn", () => {
	/**
	 * Reduced motion drops the pacing, not the updates: the arrival is what stillness
	 * asks not to see, and the clock is what puts arriving events on screen at all.
	 */
	it("keeps reading the stream when stillness is asked for", async () => {
		still();
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});

		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "say", block: 0, text: "the frame is live.", parent: null });
		await settle(300);

		// the stream is still open, so nothing but the tick can have rendered this
		expect(canvas.latest().phase).toBe("playing");
		expect(canvas.latest().entries.filter((entry) => entry.kind === "prose")).toEqual([
			{ key: "say:1:0", kind: "prose", full: "the frame is live.", landed: expect.anything(), settled: false },
		]);
	});

	/**
	 * The clock outlives the stream by design — the pace runs up to 0.8s behind the
	 * wire — and it has to stop once the edge has caught up, or it re-folds the
	 * transcript ten times a second for the rest of the session.
	 */
	it("stops its clock once the last word has landed", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "say", block: 0, text: "done.", parent: null });
		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(1400);

		expect(canvas.latest().phase).toBe("settled");
		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
	});

	/** a message that never streamed has no schedule to spend, so the clock must not wait on one */
	it("stops its clock on a message that arrived whole", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "said", text: "done.", parent: null });
		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(600);

		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
	});

	/** the daemon ends every turn; a stream that stops without one stopped on this side */
	it("says so when the stream ends without the turn ending", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.close();
		await settle(300);

		expect(canvas.latest().phase).toBe("settled");
		expect(canvas.latest().entries.at(-1)).toMatchObject({ kind: "note", text: "the turn stream ended" });
	});
});
