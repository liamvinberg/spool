// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { PlayerSize } from "./player-fit";
import { type Sizing, useSizing } from "./player-size";
import type { Held, Size } from "./player-size-model";

const OWN = { w: 800, h: 700 };

/** The size control on a frame drawn at 800 × 700, with the frames it would draw held back until `frame` runs one. */
function mount(start: Held, room: Size) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const frames = new Map<number, FrameRequestCallback>();
	let next = 1;
	vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
		frames.set(next, run);
		return next++;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
	const laid: (Size | null)[] = [];
	const size: PlayerSize = {
		held: () => start,
		authored: () => OWN,
		hold: () => {},
		lay: (box) => laid.push(box),
	};
	let sizing: Sizing | undefined;
	function Probe({ room }: { room: Size }) {
		sizing = useSizing(size, "one", room, OWN, 1, false);
		return null;
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = (at: Size) => act(() => root.render(createElement(Probe, { room: at })));
	render(room);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return {
		/** Do something to the control, and let what it lays out reach the frame. */
		act: async (run: (sizing: Sizing) => void) => {
			await act(async () => run(sizing as Sizing));
		},
		/** Run the frames waiting, 40ms on. */
		frame: async () => {
			const waiting = [...frames.values()];
			frames.clear();
			await act(async () => {
				for (const run of waiting) run(performance.now() + 40);
			});
		},
		render,
		laid: () => laid.at(-1),
	};
}

it("springs to Window like any other size, there and back, and follows the window itself exactly", async () => {
	const room = { w: 1440, h: 870 };
	const drawn = mount({ id: "drawn", size: OWN }, room);
	await drawn.act((sizing) => sizing.openMenu());
	await drawn.act((sizing) => sizing.preview("window"));
	// on its way, not there before a frame has drawn
	expect(drawn.laid()).not.toEqual(room);
	await drawn.frame();
	expect(drawn.laid()?.w).toBeGreaterThan(OWN.w);
	expect(drawn.laid()?.w).toBeLessThan(room.w);
	// while it shows the window, the window's own resize is followed at once
	drawn.render({ w: 1200, h: 800 });
	await drawn.act(() => {});
	expect(drawn.laid()).toEqual({ w: 1200, h: 800 });

	// and resting at Window, a preview let go of springs back to it
	const window = mount({ id: "window", size: room }, room);
	await window.act((sizing) => sizing.openMenu());
	await window.act((sizing) => sizing.preview("phone"));
	await window.frame();
	await window.act((sizing) => sizing.closeMenu());
	await window.frame();
	// on its way back with the speed it had, not snapped there
	expect(window.laid()?.w).toBeLessThan(room.w);
});
