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

		// Keyboard activation remains available after a pointer drag.
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
			host.querySelectorAll("button")[0]?.click();
		});
		expect(onFocus).toHaveBeenCalledWith("/w/alpha");
	});

	it.each(["dragging", "settling"])("does not overwrite a changed session while %s", async (phase) => {
		const onReorder = vi.fn();
		const { host, rerender } = await render({ onReorder });
		place(host);
		await act(async () => {
			tabOf(host, 0)?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 5, clientX: 50 }),
			);
			window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 5, clientX: 170 }));
			if (phase === "settling") window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 5, clientX: 170 }));
		});
		// Same number of tabs, different identities: length alone cannot detect this.
		await rerender({ tabs: [...tabs.slice(0, 2), { root: "/w/delta", name: "delta" }] });
		await act(async () => {
			if (phase === "dragging") window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 5, clientX: 170 }));
			await new Promise((resolve) => setTimeout(resolve, 260));
		});
		expect(onReorder).not.toHaveBeenCalled();
	});

	it("lets go of a drag when a tab opens or closes under it, stepping every tab back", async () => {
		const onReorder = vi.fn();
		const onFocus = vi.fn();
		const { host, rerender } = await render({ onReorder, onFocus });
		place(host);
		await act(async () => {
			tabOf(host, 0)?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 6, clientX: 50 }),
			);
			window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 6, clientX: 170 }));
		});
		expect(tabOf(host, 1)?.style.transform).toBe("translateX(-110px)");
		await rerender({ tabs: tabs.slice(0, 2) });
		// alpha and beta, the tabs still open, travel back rather than snapping
		for (const index of [0, 1]) {
			expect(tabOf(host, index)?.style.transform).toBe("translateX(0px)");
			expect(tabOf(host, index)?.style.transition).toContain("200ms");
		}
		await act(async () => {
			window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 6, clientX: 170 }));
			host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[0]?.click();
		});
		expect(onReorder).not.toHaveBeenCalled();
		// the release that ends a drag is not a click on the tab
		expect(onFocus).not.toHaveBeenCalled();
	});

	it("takes the arrangement at once when a tab is pressed while the dropped one is still landing", async () => {
		const onReorder = vi.fn();
		const { host } = await render({ onReorder });
		place(host);
		await act(async () => {
			tabOf(host, 0)?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 7, clientX: 50 }),
			);
			window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 170 }));
			window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, clientX: 170 }));
		});
		expect(onReorder).not.toHaveBeenCalled();
		await act(async () => {
			tabOf(host, 2)?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 8, clientX: 250 }),
			);
		});
		expect(onReorder).toHaveBeenCalledWith(["/w/beta", "/w/alpha", "/w/gamma"]);
		await act(async () => {
			window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 8, clientX: 250 }));
			await new Promise((resolve) => setTimeout(resolve, 260));
		});
		expect(onReorder).toHaveBeenCalledTimes(1);
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

	it("keeps the dragged tab under the pointer when the strip scrolls", async () => {
		const onReorder = vi.fn();
		const { host } = await render({ onReorder });
		place(host);
		const scroller = host.querySelector<HTMLElement>(".project-tabs-scroll");
		if (scroller === null) throw new Error("missing tab scroller");
		scroller.scrollLeft = 40;

		await act(async () => {
			tabOf(host, 0)?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 4, clientX: 50 }),
			);
			window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 4, clientX: 70 }));
			scroller.scrollLeft = 150;
			scroller.dispatchEvent(new Event("scroll"));
		});
		expect(tabOf(host, 0)?.style.transform).toBe("translateX(130px)");
		expect(tabOf(host, 1)?.style.transform).toBe("translateX(-110px)");

		await act(async () => {
			window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, clientX: 70 }));
			await new Promise((resolve) => setTimeout(resolve, 260));
		});
		expect(onReorder).toHaveBeenCalledWith(["/w/beta", "/w/alpha", "/w/gamma"]);
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

/**
 * Give every tab's slot the box it would have on screen: 100 wide, 10 apart,
 * moving left as the strip scrolls right.
 */
function place(host: HTMLElement) {
	const scroller = host.querySelector<HTMLElement>(".project-tabs-scroll");
	[...host.querySelectorAll<HTMLElement>("[data-tab-slot]")].forEach((slot, index) => {
		slot.getBoundingClientRect = () => {
			const left = index * 110 - (scroller?.scrollLeft ?? 0);
			return { left, right: left + 100, width: 100, top: 0, bottom: 26, height: 26, x: left, y: 0 } as DOMRect;
		};
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
	const rerender = async (next: Partial<Parameters<typeof TabStrip>[0]> = {}) =>
		act(async () => {
			root.render(
				createElement(TabStrip, {
					tabs,
					focused: "/w/alpha",
					onFocus: () => {},
					onClose: () => {},
					onReorder: () => {},
					onPick: () => {},
					...props,
					...next,
				}),
			);
		});
	await rerender();
	return { host, rerender };
}

it("exports an inactive tab without focusing it, and restores keyboard focus on dismissal", async () => {
	const onExport = vi.fn();
	const onFocus = vi.fn();
	const onClose = vi.fn();
	const { host } = await render({ onExport, onFocus, onClose });
	const beta = host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[1];
	await act(async () =>
		beta?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 20 }),
		),
	);
	expect(onFocus).not.toHaveBeenCalled();
	expect(document.activeElement?.textContent).toBe("Export project…");
	await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
	expect(onExport).toHaveBeenCalledWith(tabs[1]);
	expect(onFocus).not.toHaveBeenCalled();
	expect(document.activeElement).toBe(beta);
	await act(async () =>
		beta?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }),
		),
	);
	await act(async () =>
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
		),
	);
	expect(document.activeElement?.textContent).toBe("Close tab");
	await act(async () =>
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
		),
	);
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(document.activeElement).toBe(beta);
	expect(onClose).not.toHaveBeenCalled();
});

it("closes a tab by the middle button, and puts its menu away with it", async () => {
	const onClose = vi.fn();
	const { host, rerender } = await render({ onClose });
	const beta = host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[1];
	await act(async () => beta?.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 })));
	expect(onClose).toHaveBeenCalledWith("/w/beta");
	await act(async () =>
		beta?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 20 }),
		),
	);
	expect(document.querySelector('[role="menu"]')).not.toBeNull();
	await rerender({ tabs: [tabs[0], tabs[2]].flatMap((tab) => (tab === undefined ? [] : [tab])) });
	expect(document.querySelector('[role="menu"]')).toBeNull();
	// already closing: no longer a tab to anything but the eye
	expect([...host.querySelectorAll<HTMLElement>("[data-tab]")].map((tab) => tab.dataset.tab)).toEqual([
		"/w/alpha",
		"/w/gamma",
	]);
});
