// @vitest-environment happy-dom

import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import type { PresenceState } from "../../team-sync-protocol";
import { createCameraStore } from "./camera-store";
import { createPresenceRoom } from "./presence";
import { PresenceFaces } from "./presence-faces";
import { usePresenceSender } from "./use-presence";

/** A crowded page (#107): a canvas whose pointer the team hides stops sending it, and says who it follows. */

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

interface Props {
	page: string;
	hidden: boolean;
	following: string | null;
}

function sender(initial: Props) {
	const sent: PresenceState[] = [];
	const camera = createCameraStore();
	camera.set({ x: 0, y: 0, k: 1 });
	const send = (state: PresenceState) => sent.push(state);
	function Canvas(props: Props) {
		const viewportRef = useRef<HTMLDivElement | null>(null);
		usePresenceSender({
			send,
			team: true,
			camera,
			viewportRef,
			page: props.page,
			inside: null,
			dragging: () => [],
			hidden: props.hidden,
			following: props.following,
		});
		return createElement("div", { ref: viewportRef, "data-viewport": "" });
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const render = (props: Props) => act(() => root.render(createElement(Canvas, props)));
	render(initial);
	const viewport = () => host.querySelector<HTMLElement>("[data-viewport]") as HTMLElement;
	return {
		sent,
		render,
		move(x: number, y: number) {
			act(() => {
				viewport().dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
			});
		},
		settle: () => act(() => vi.advanceTimersByTime(500)),
	};
}

it("stops sending pointer moves while its pointer is hidden, but still says its page, and starts again when shown", () => {
	const canvas = sender({ page: "", hidden: false, following: null });
	canvas.move(10, 10);
	canvas.settle();
	expect(canvas.sent.at(-1)?.pointer).toEqual({ x: 10, y: 10 });

	canvas.render({ page: "", hidden: true, following: null });
	canvas.settle();
	expect(canvas.sent.at(-1)).toMatchObject({ page: "", pointer: null, view: null, pressed: false });
	const told = canvas.sent.length;
	for (let x = 20; x < 200; x += 20) {
		canvas.move(x, x);
		canvas.settle();
	}
	expect(canvas.sent.length).toBe(told);

	canvas.render({ page: "flows", hidden: true, following: null });
	canvas.settle();
	expect(canvas.sent.length).toBe(told + 1);
	expect(canvas.sent.at(-1)).toMatchObject({ page: "flows", pointer: null });

	canvas.render({ page: "flows", hidden: false, following: null });
	canvas.settle();
	expect(canvas.sent.at(-1)?.pointer).toEqual({ x: 180, y: 180 });
});

it("sends at most one state a tick however fast the pointer moves", () => {
	const canvas = sender({ page: "", hidden: false, following: null });
	canvas.settle();
	const before = canvas.sent.length;
	for (let step = 0; step < 50; step++) {
		canvas.move(step, step);
		act(() => vi.advanceTimersByTime(10));
	}
	canvas.settle();
	// 500 ms of moves, a tick being 100 ms
	expect(canvas.sent.length - before).toBeLessThanOrEqual(6);
});

it("says who it follows, so the team always shows it that person", () => {
	const canvas = sender({ page: "", hidden: false, following: null });
	canvas.settle();
	expect(canvas.sent.at(-1)).not.toHaveProperty("following");
	canvas.render({ page: "", hidden: false, following: "ben" });
	canvas.settle();
	expect(canvas.sent.at(-1)?.following).toBe("ben");
	canvas.render({ page: "", hidden: false, following: null });
	canvas.settle();
	expect(canvas.sent.at(-1)).not.toHaveProperty("following");
});

it("says on the faces that this person's pointer is hidden, until it is shown again or the stream goes", () => {
	const room = createPresenceRoom();
	room.hear({
		type: "presence",
		person: { accountId: "ada", name: "ada", color: "red" },
		state: { page: "", pointer: { x: 1, y: 1 }, pressed: false, dragging: [], inside: null, view: null },
		still: 0,
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(createElement(PresenceFaces, { room, page: "", following: null, onFollow: () => {} })));
	const notice = () => host.querySelector("[data-presence-hidden]")?.textContent ?? null;
	expect(notice()).toBeNull();

	act(() => room.hide(true));
	expect(room.pointerHidden()).toBe(true);
	expect(notice()).toMatch(/your pointer is hidden/i);
	act(() => room.hide(false));
	expect(notice()).toBeNull();
	act(() => room.hide(true));
	act(() => room.reset());
	expect(room.pointerHidden()).toBe(false);
	expect(notice()).toBeNull();
});
