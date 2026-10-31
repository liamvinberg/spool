// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusAfterClose, heldRoom, TabStrip, tabWidths } from "./tab-strip";

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

/** the landing is a timer the length of the slow transition, walked rather than waited out */
function landingClock() {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

afterEach(() => {
	vi.useRealTimers();
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
});

describe("the tab strip", () => {
	it("carries a tab past its neighbour and writes the arrangement on the drop", async () => {
		landingClock();
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
		expect(tabOf(host, 0)?.style.transition).toContain("var(--transition-duration-base)");
		expect(onReorder).not.toHaveBeenCalled();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(260);
		});
		expect(onReorder).toHaveBeenCalledWith(["/w/beta", "/w/alpha", "/w/gamma"]);

		// the press that became a drag is not also a click on the tab it left
		await act(async () => {
			host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[0]?.click();
		});
		expect(onFocus).not.toHaveBeenCalled();

		// Keyboard activation remains available after a pointer drag.
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
			host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[0]?.click();
		});
		expect(onFocus).toHaveBeenCalledWith("/w/alpha");
	});

	it.each(["dragging", "settling"])("does not overwrite a changed session while %s", async (phase) => {
		landingClock();
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
			await vi.advanceTimersByTimeAsync(260);
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
			expect(tabOf(host, index)?.style.transition).toContain("var(--transition-duration-base)");
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
		landingClock();
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
			await vi.advanceTimersByTimeAsync(260);
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
		landingClock();
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
			await vi.advanceTimersByTimeAsync(260);
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
			host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[0]?.click();
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
					onHome: () => {},
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

it("offers History… on a team project's tab, and not on one that isn't a team's (spool#187)", async () => {
	const onHistory = vi.fn();
	const team = tabs.map((tab, at) => (at === 1 ? { ...tab, teamAddress: "spool.page/devosurf/beta" } : tab));
	const { host } = await render({ onHistory, tabs: team });
	const items = async (at: number) => {
		const label = host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[at];
		await act(async () =>
			label?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 20 }),
			),
		);
		const found = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		return found;
	};
	expect((await items(0)).map((item) => item.textContent)).not.toContain("History…");
	await act(async () =>
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
		),
	);
	const history = (await items(1)).find((item) => item.textContent === "History…");
	await act(async () => history?.click());
	expect(onHistory).toHaveBeenCalledWith(team[1]);
});

describe("focusAfterClose", () => {
	const roots = ["/w/alpha", "/w/beta", "/w/gamma"];
	it("hands focus to the tab after the one that closed", () => {
		expect(focusAfterClose(roots, "/w/beta")).toBe("/w/gamma");
		expect(focusAfterClose(roots, "/w/alpha")).toBe("/w/beta");
	});
	it("falls back to the tab before when the last one closed", () => {
		expect(focusAfterClose(roots, "/w/gamma")).toBe("/w/beta");
	});
	it("goes Home only when the only tab closed", () => {
		expect(focusAfterClose(["/w/alpha"], "/w/alpha")).toBeNull();
		expect(focusAfterClose(roots, "/w/missing")).toBeNull();
	});
});

describe("tabWidths", () => {
	const sizes = { max: 200, min: 112, compact: 40 };
	it("gives every tab its widest while they fit, then every tab alike", () => {
		expect(tabWidths(3, 0, 1000, sizes)).toEqual([200, 200, 200]);
		expect(tabWidths(4, 1, 600, sizes)).toEqual([150, 150, 150, 150]);
	});
	it("keeps the focused tab's floor out of the others' share, down to the mark", () => {
		expect(tabWidths(5, 2, 432, sizes)).toEqual([80, 80, 112, 80, 80]);
		expect(tabWidths(5, 2, 200, sizes)).toEqual([40, 40, 112, 40, 40]);
		expect(tabWidths(4, -1, 200, sizes)).toEqual([50, 50, 50, 50]);
	});
});

describe("heldRoom", () => {
	const widths = [80, 80, 112, 80, 80];
	it("shortens the row by a tab not focused, so the tabs after the gap keep their widths", () => {
		expect(tabWidths(4, 1, heldRoom(widths, 1, 2), { max: 200, min: 112, compact: 40 })).toEqual([80, 112, 80, 80]);
		// the focused one closing: the tab after it takes the floor, and the row is shorter by what it had
		expect(tabWidths(4, 2, heldRoom(widths, 2, 2), { max: 200, min: 112, compact: 40 })).toEqual([80, 80, 112, 80]);
	});
	it("keeps the row's length when the last tab closes, so the new last tab ends where it ended", () => {
		expect(heldRoom(widths, 4, 2)).toBe(432);
	});
});

it("dots a tab not focused with who else is in its project, three at most, and never the focused one", async () => {
	const mate = (name: string, idle = false) => ({ accountId: name, name, color: "#7aa7ff", idle });
	const here = [mate("ana"), mate("ben"), mate("cleo"), mate("dag", true)];
	const { host, rerender } = await render({
		tabs: [
			{ root: "/w/alpha", name: "alpha", here },
			{ root: "/w/beta", name: "beta", here },
			{ root: "/w/gamma", name: "gamma" },
		],
	});
	const dots = (index: number) =>
		[...(tabOf(host, index)?.querySelectorAll<HTMLElement>("[data-tab-here-dot]") ?? [])].map(
			(dot) => dot.dataset.tabHereDot,
		);
	expect(dots(0)).toEqual([]);
	expect(dots(1)).toEqual(["ana", "ben", "cleo"]);
	expect(tabOf(host, 1)?.querySelector("[data-tab-here] .sr-only")?.textContent).toBe(", ana, ben, cleo, dag here");
	expect(tabOf(host, 1)?.querySelector("[data-tab-here-more]")?.textContent).toBe("+1");
	// after the name, not in it, so a long name fades under its own gradient and leaves the dots whole
	expect(tabOf(host, 1)?.querySelector(".project-tab-name [data-tab-here]")).toBeNull();
	expect(dots(2)).toEqual([]);
	await rerender({ focused: "/w/beta" });
	expect(dots(0)).toEqual(["ana", "ben", "cleo"]);
	expect(dots(1)).toEqual([]);
});

it("swells a tab's dots into everyone's name pills while the pointer is on them", async () => {
	const mate = (name: string) => ({ accountId: name, name, color: "#7aa7ff", idle: false });
	const { host } = await render({
		tabs: [
			{ root: "/w/alpha", name: "alpha" },
			{ root: "/w/beta", name: "beta", here: [mate("ana"), mate("ben"), mate("cleo"), mate("dag")] },
		],
	});
	const zone = tabOf(host, 1)?.querySelector<HTMLElement>("[data-tab-here]");
	const pills = () =>
		[...document.querySelectorAll<HTMLElement>("[data-tab-here-pill]")].map((pill) => pill.dataset.tabHerePill);
	expect(pills()).toEqual([]);
	await act(async () => {
		// React hears enter and leave from the pointer passing over and out
		zone?.dispatchEvent(new PointerEvent("pointerover", { pointerType: "mouse", bubbles: true }));
	});
	expect(pills()).toEqual(["ana", "ben", "cleo", "dag"]);
	await act(async () => {
		zone?.dispatchEvent(
			new PointerEvent("pointerout", { pointerType: "mouse", bubbles: true, relatedTarget: document.body }),
		);
	});
	await vi.waitFor(() => expect(pills()).toEqual([]));
});

it("offers Match the team in a team project's tab menu only", async () => {
	const onMatchTeam = vi.fn();
	const team = { root: "/w/team", name: "team", teamAddress: "devosurf" };
	const { host } = await render({ tabs: [...tabs, team], onMatchTeam });
	const items = async (at: number) => {
		await act(async () =>
			host
				.querySelectorAll<HTMLButtonElement>(".project-tab-label")
				[at]?.dispatchEvent(
					new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 20 }),
				),
		);
		const labels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
		return labels;
	};
	expect(await items(1)).not.toContain("Match the team");
	await act(async () =>
		document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
	);
	expect(await items(3)).toEqual(["Export project…", "Match the team", "Close tab"]);
	await act(async () =>
		[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
			.find((item) => item.textContent === "Match the team")
			?.click(),
	);
	expect(onMatchTeam).toHaveBeenCalledWith(team);
});
