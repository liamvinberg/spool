// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { CanvasSidebar } from "./sidebar";

/** The toggle modifier as this environment binds it — ctrl under happy-dom, ⌘ on a Mac. */
const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [
	{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
	{ name: "checkout", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
];

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

/** the navigator's width is remembered across reloads, and a resized one is not the next test's */
beforeEach(() => {
	const box: Storage | undefined = window.localStorage;
	box?.clear();
});

afterEach(() => {
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
});

describe("page tree", () => {
	it("switches pages without opening folders, then expands only from the chevron", async () => {
		const onSwitchPage = vi.fn();
		const onSelectFrame = vi.fn();
		const onDoubleClickFrame = vi.fn();
		const { host } = await render({ onSwitchPage, onSelectFrame, onDoubleClickFrame });

		expect(host.textContent).toContain("Pages2");
		expect(host.textContent).toContain("folder switches page");
		expect(host.querySelector('button[aria-label="Expand root"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).not.toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).not.toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).toBeNull();

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true, ...ACCEL }));
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
		expect(host.querySelector('button[aria-label="root page"]')?.hasAttribute("title")).toBe(false);

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="root page"]')?.focus();
		});
		expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe("root");

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
	});

	it("resizes up to 480 pixels and snaps to the page strip below 144 pixels", async () => {
		const { host } = await render();
		const aside = host.querySelector<HTMLElement>("aside");
		const resize = host.querySelector<HTMLButtonElement>('button[aria-label="Resize pages"]');
		expect(aside?.style.width).toBe("248px");
		expect(resize).not.toBeNull();

		await act(async () => {
			resize?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 248, pointerId: 1 }));
			resize?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 600, pointerId: 1 }));
			resize?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 600, pointerId: 1 }));
		});
		expect(aside?.style.width).toBe("480px");

		await act(async () => {
			resize?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 480, pointerId: 2 }));
			resize?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, pointerId: 2 }));
			resize?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 100, pointerId: 2 }));
		});
		expect(aside?.style.width).toBe("44px");
		expect(host.querySelector('button[aria-label="Expand pages"]')).not.toBeNull();
	});

	it("does not open a page activated outside the tree", async () => {
		const { host, rerender } = await render();
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();

		await rerender({ activePage: "shop" });

		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).not.toBeNull();
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
