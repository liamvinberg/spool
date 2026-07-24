// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasSidebar } from "./sidebar";

const frames = [
	{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844, hasThumb: false },
	{ name: "checkout", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844, hasThumb: false },
];

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

afterEach(() => {
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
});

describe("page tree", () => {
	it("switches and opens folders, then selects frames with modifiers", async () => {
		const onSwitchPage = vi.fn();
		const onSelectFrame = vi.fn();
		const onDoubleClickFrame = vi.fn();
		const { host } = await render({ onSwitchPage, onSelectFrame, onDoubleClickFrame });

		expect(host.textContent).toContain("Pages2");
		expect(host.textContent).toContain("folder switches page");
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).not.toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).toBeNull();

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true, metaKey: true }));
		});
		expect(onSelectFrame).toHaveBeenCalledWith("checkout", { shift: true, toggle: true });
		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		expect(onDoubleClickFrame).toHaveBeenCalledWith("checkout");
	});

	it("collapses to a page strip that can switch every page", async () => {
		const onSwitchPage = vi.fn();
		const { host } = await render({ onSwitchPage });

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Collapse pages"]')?.click();
		});
		expect(host.querySelector('button[aria-label="Expand pages"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="root page"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="shop page"]')).not.toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
	});

	it("opens a page activated outside the tree", async () => {
		const { host, rerender } = await render();
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();

		await rerender({ activePage: "shop" });

		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="shop page"]')?.getAttribute("aria-current")).toBe("page");
	});
});

async function render({
	onSwitchPage = vi.fn(),
	onSelectFrame = vi.fn(),
	onDoubleClickFrame = vi.fn(),
}: Partial<React.ComponentProps<typeof CanvasSidebar>> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted.push({ root, host });
	const props: React.ComponentProps<typeof CanvasSidebar> = {
		pages: ["shop"],
		activePage: "",
		frames,
		selected: [],
		onSwitchPage,
		onSelectFrame,
		onDoubleClickFrame,
	};
	const rerender = async (next: Partial<React.ComponentProps<typeof CanvasSidebar>> = {}) => {
		await act(async () => {
			root.render(createElement(CanvasSidebar, { ...props, ...next }));
		});
	};
	await rerender();
	return { host, rerender };
}
