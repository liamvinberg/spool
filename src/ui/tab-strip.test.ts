// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabStrip } from "./tab-strip";

/**
 * The tabs, arranged. Every box reads as zero under happy-dom, so each tab is
 * given the box it would have on screen — three 100-wide tabs with a 10 gap —
 * and the whole drag is arithmetic over those.
 */
const tabs = [
	{ root: "/w/alpha", name: "alpha" },
	{ root: "/w/beta", name: "beta" },
	{ root: "/w/gamma", name: "gamma" },
];

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

afterEach(() => {
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
});

describe("the tab strip", () => {
	it("carries a tab past its neighbour and writes the arrangement on the drop", async () => {
		const onReorder = vi.fn();
		const onFocus = vi.fn();
		const { host } = await render({ onReorder, onFocus });
		place(host);

		const alpha = tabOf(host, 0);
		await act(async () => {
			alpha?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 50 }));
			window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 170 }));
		});
		// past beta's centre: beta steps back by alpha's width and the gap it leaves
		expect(tabOf(host, 1)?.style.transform).toBe("translateX(-110px)");
		expect(tabOf(host, 2)?.style.transform).toBe("translateX(0px)");

		await act(async () => {
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 170 }));
		});
		// let go and the tab travels the last of the way itself, onto the exact left
		// edge of the slot it took: the order is not written until it has arrived
		expect(tabOf(host, 0)?.style.transform).toBe("translateX(110px)");
		expect(tabOf(host, 0)?.style.transition).toContain("200ms");
		expect(onReorder).not.toHaveBeenCalled();

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 260));
		});
		expect(onReorder).toHaveBeenCalledWith(["/w/beta", "/w/alpha", "/w/gamma"]);

		// the press that became a drag is not also a click on the tab it left
		await act(async () => {
			host.querySelectorAll("button")[0]?.click();
		});
		expect(onFocus).not.toHaveBeenCalled();
	});

	it("leaves the order alone when the drag never reaches the next tab", async () => {
		const onReorder = vi.fn();
		const onFocus = vi.fn();
		const { host } = await render({ onReorder, onFocus });
		place(host);

		const alpha = tabOf(host, 0);
		await act(async () => {
			alpha?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 2, clientX: 50 }));
			window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientX: 90 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2, clientX: 90 }));
		});
		expect(onReorder).not.toHaveBeenCalled();
		expect(tabOf(host, 1)?.style.transform).toBe("translateX(0px)");
	});

	it("focuses the project on a press that never travelled", async () => {
		const onFocus = vi.fn();
		const { host } = await render({ onFocus });
		place(host);

		const alpha = tabOf(host, 0);
		await act(async () => {
			alpha?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 3, clientX: 50 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientX: 50 }));
			host.querySelectorAll("button")[0]?.click();
		});
		expect(onFocus).toHaveBeenCalledWith("/w/alpha");
	});
});

/** Give every tab the box it would have on screen: 100 wide, 10 apart. */
function place(host: HTMLElement) {
	[...host.querySelectorAll<HTMLElement>("[data-tab]")].forEach((tab, index) => {
		const left = index * 110;
		tab.getBoundingClientRect = () =>
			({ left, right: left + 100, width: 100, top: 0, bottom: 26, height: 26, x: left, y: 0 }) as DOMRect;
	});
}

function tabOf(host: HTMLElement, index: number): HTMLElement | undefined {
	return host.querySelectorAll<HTMLElement>("[data-tab]")[index];
}

async function render(props: Partial<Parameters<typeof TabStrip>[0]> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted.push({ root, host });
	await act(async () => {
		root.render(
			createElement(TabStrip, {
				tabs,
				focused: "/w/alpha",
				onFocus: () => {},
				onClose: () => {},
				onReorder: () => {},
				onPick: () => {},
				...props,
			}),
		);
	});
	return { host };
}
