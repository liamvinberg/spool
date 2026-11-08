// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { exportProject } from "./api";
import type { ProjectDownload } from "./desktop-window";
import { ProjectTabMenu } from "./project-tab-menu";

/**
 * Export project… never leaves the menu that asked (spool#240): it goes
 * straight to building the .spool, then where it landed, in the same box. The
 * tab's menu stands in for the cover's, which takes the same steps.
 */

vi.mock("./api", async (actual) => ({ ...(await actual<typeof import("./api")>()), exportProject: vi.fn() }));

let unmount: (() => void) | undefined;

afterEach(() => {
	unmount?.();
	unmount = undefined;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function render() {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const downloads: string[] = [];
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:project");
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
		downloads.push(this.download);
	});
	const anchor = document.createElement("button");
	document.body.append(anchor);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const onClose = vi.fn();
	act(() =>
		root.render(
			createElement(ProjectTabMenu, {
				project: { name: "coffee", root: "/w/coffee" },
				x: 20,
				y: 30,
				anchor,
				onClose,
				onCloseTab: () => {},
			}),
		),
	);
	unmount = () => {
		act(() => root.unmount());
		host.remove();
		anchor.remove();
	};
	return { onClose, downloads };
}

const box = () => document.querySelector<HTMLElement>('[role="menu"]');
const row = (label: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.startsWith(label));

async function settle(done: () => boolean) {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("the menu did not settle");
}

const press = (key: string) =>
	act(() => {
		box()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});

it("builds the .spool in the menu's own box, and in the Mac app says where it saved and shows it in Finder", async () => {
	const listeners: ((report: ProjectDownload) => void)[] = [];
	const revealDownload = vi.fn();
	vi.stubGlobal("spoolCanvasWindow", {
		onCommand: () => () => {},
		setCanvasActive: () => {},
		onProjectDownload: (listener: (report: ProjectDownload) => void) => {
			listeners.push(listener);
			return () => listeners.splice(listeners.indexOf(listener), 1);
		},
		revealDownload,
	});
	vi.mocked(exportProject).mockResolvedValue({ blob: new Blob(["a project"]), filename: "coffee.spool" });
	const { onClose, downloads } = render();
	const menu = box();
	await act(async () => row("Export project…")?.click());
	// no format to choose: straight to building, in the same box
	expect(box()).toBe(menu);
	expect(menu?.textContent).toContain("Building coffee.spool");
	await settle(() => downloads.length === 1);
	expect(exportProject).toHaveBeenCalledWith("/w/coffee");
	expect(downloads).toEqual(["coffee.spool"]);
	await act(async () => {
		for (const listener of [...listeners])
			listener({
				status: "completed",
				filename: "coffee (1).spool",
				path: "/Users/cata/Downloads/coffee (1).spool",
			});
	});
	await settle(() => menu?.textContent?.includes("Saved to Downloads") === true);
	expect(menu?.textContent).toContain("coffee (1).spool · 9 B");
	await press("Enter");
	expect(revealDownload).toHaveBeenCalledWith("/Users/cata/Downloads/coffee (1).spool");
	expect(onClose).toHaveBeenCalled();
});

it("keeps a failure in the box, and Try again builds it again; a browser says Downloaded", async () => {
	vi.mocked(exportProject).mockRejectedValueOnce(new Error("Disk unavailable."));
	vi.mocked(exportProject).mockResolvedValueOnce({ blob: new Blob(["a project"]), filename: "coffee.spool" });
	const { downloads } = render();
	await act(async () => row("Export project…")?.click());
	await settle(() => box()?.querySelector('[role="alert"]') !== null);
	expect(box()?.querySelector('[role="alert"]')?.textContent).toBe("Disk unavailable.");
	await press("Enter");
	await settle(() => box()?.textContent?.includes("Downloaded") === true);
	expect(exportProject).toHaveBeenCalledTimes(2);
	expect(downloads).toEqual(["coffee.spool"]);
	expect(row("Show in Finder")).toBeUndefined();
});
