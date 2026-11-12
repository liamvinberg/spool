// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportDownload } from "../desktop-window";
import { ContextMenu } from "./context-menu";

/**
 * Export never leaves the right-click menu (spool#239): the menu becomes the
 * choice, then the building line, then where the file landed. The daemon's
 * routes are answered here; canvas-export.test.ts and export-browser.test.ts
 * walk PNG and PDF through the real canvas.
 */

const callbacks = {
	tidyLabel: "Tidy page",
	onTidy: () => {},
	onCopyPath: () => {},
	onPlay: () => {},
	onReload: () => {},
	onTrash: () => {},
};

const PLANS: Record<string, { reach: string[] }> = {
	checkout: { reach: ["cart", "pay/card", "receipt", "map"] },
	a: { reach: [] },
	b: { reach: [] },
};

let unmount: (() => void) | undefined;

afterEach(() => {
	unmount?.();
	unmount = undefined;
	localStorage.clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function daemon(fail: () => boolean = () => false) {
	const html: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), "http://spool.localhost");
			const frame = url.searchParams.get("frame") ?? "";
			if (url.pathname === "/api/p/demo/export/plan") return Response.json(PLANS[frame]);
			if (url.pathname === "/api/p/demo/export/html") {
				html.push(`${frame}:${url.searchParams.get("scope")}:${url.searchParams.get("player")}`);
				if (fail()) return Response.json({ error: "card could not compile" }, { status: 500 });
				return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
			}
			return Response.json({});
		}),
	);
	const downloads: string[] = [];
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
		downloads.push(this.download);
	});
	return { html, downloads };
}

function render(exportable: readonly string[]) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const onClose = vi.fn();
	const mount = () =>
		act(() =>
			root.render(
				createElement(ContextMenu, {
					at: { x: 20, y: 30 },
					project: "demo",
					exportable,
					capture: () => Promise.reject(new Error("no capture here")),
					onClose,
					...callbacks,
				}),
			),
		);
	mount();
	unmount = () => {
		act(() => root.unmount());
		host.remove();
	};
	return { host, onClose, mount };
}

const row = (host: HTMLElement, label: string) =>
	[...host.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((item) => item.textContent?.startsWith(label));

async function settle(done: () => boolean) {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("the menu did not settle");
}

const press = (host: HTMLElement, key: string) =>
	act(() => {
		host.querySelector('[role="menu"]')?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});

async function choose(host: HTMLElement, format: string) {
	const segment = host.querySelector<HTMLInputElement>(`input[value="${format}"]`);
	await act(async () => segment?.click());
}

describe("the right-click menu's export", () => {
	it("becomes the choice for a frame that links to others, takes the flow or the frame alone, and says where it saved", async () => {
		const { html, downloads } = daemon();
		const listeners: ((report: ExportDownload) => void)[] = [];
		const revealDownload = vi.fn();
		vi.stubGlobal("spoolCanvasWindow", {
			onCommand: () => () => {},
			setCanvasActive: () => {},
			onExportDownload: (listener: (report: ExportDownload) => void) => {
				listeners.push(listener);
				return () => listeners.splice(listeners.indexOf(listener), 1);
			},
			revealDownload,
		});
		const { host, onClose } = render(["checkout"]);
		const menu = host.querySelector('[role="menu"]');
		expect(row(host, "Export…")?.textContent).toBe("Export…png");
		await act(async () => row(host, "Export…")?.click());
		// the same box, gone on into its next step
		expect(host.querySelector('[role="menu"]')).toBe(menu);
		await settle(() => host.textContent?.includes("demo-checkout.png") === true);
		// a picture has no flow to take
		expect(row(host, "Only this frame")).toBeUndefined();

		await choose(host, "html");
		await settle(() => row(host, "This frame and the 4 it links to") !== undefined);
		expect(row(host, "This frame and the 4 it links to")?.getAttribute("aria-checked")).toBe("true");
		expect(host.textContent).toContain("demo-checkout.html");
		await act(async () => row(host, "Only this frame")?.click());
		// the file opens in the player unless switched off, and the row says what it opens as
		expect(row(host, "With player")?.getAttribute("aria-checked")).toBe("true");
		expect(row(host, "With player")?.textContent).toContain("Anyone can resize it in the browser.");
		await act(async () => row(host, "With player")?.click());
		expect(row(host, "With player")?.textContent).toContain("Opens as the frame alone.");

		await press(host, "Enter");
		await settle(() => downloads.length === 1);
		expect(html).toEqual(["checkout:one:0"]);
		expect(downloads).toEqual(["demo-checkout.html"]);
		expect(host.textContent).toContain("Building demo-checkout.html");
		await act(async () => {
			for (const listener of [...listeners])
				listener({
					status: "completed",
					requested: "demo-checkout.html",
					filename: "demo-checkout (1).html",
					path: "/Users/cata/Downloads/demo-checkout (1).html",
				});
		});
		await settle(() => host.textContent?.includes("Saved to Downloads") === true);
		expect(host.textContent).toContain("demo-checkout (1).html · 15 B");
		await press(host, "Enter");
		expect(revealDownload).toHaveBeenCalledWith("/Users/cata/Downloads/demo-checkout (1).html");
		expect(onClose).toHaveBeenCalled();

		// the format is remembered, and worn by the menu's Export next time, and so is the player
		unmount?.();
		unmount = undefined;
		const again = render(["checkout"]);
		expect(row(again.host, "Export…")?.textContent).toBe("Export…html");
		await act(async () => row(again.host, "Export…")?.click());
		expect(row(again.host, "With player")?.getAttribute("aria-checked")).toBe("false");
	});

	it("gives several frames one file each, offers no scope where nothing links, and in a browser says Downloaded", async () => {
		const { html, downloads } = daemon();
		const { host } = render(["a", "b"]);
		await act(async () => row(host, "Export 2 frames…")?.click());
		await choose(host, "html");
		await settle(() => host.textContent?.includes("2 × .html") === true);
		expect(row(host, "This frame and")).toBeUndefined();

		await act(async () => row(host, "Export")?.click());
		await settle(() => host.textContent?.includes("Downloaded") === true);
		expect(html).toEqual(["a:flow:1", "b:flow:1"]);
		expect(downloads).toEqual(["demo-a.html", "demo-b.html"]);
		expect(host.textContent).toContain("2 files · 30 B");
		expect(row(host, "Show in Finder")).toBeUndefined();
	});

	it("keeps a failure in the box, and Try again runs the export again", async () => {
		let failing = true;
		const { html, downloads } = daemon(() => failing);
		const { host } = render(["a"]);
		await act(async () => row(host, "Export…")?.click());
		await choose(host, "html");
		await press(host, "Enter");
		await settle(() => host.querySelector('[role="alert"]') !== null);
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("card could not compile");
		failing = false;
		await act(async () => row(host, "Try again")?.click());
		await settle(() => host.textContent?.includes("Downloaded") === true);
		expect(html).toEqual(["a:flow:1", "a:flow:1"]);
		expect(downloads).toEqual(["demo-a.html"]);
	});
});
