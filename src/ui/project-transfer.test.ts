// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { cancelProjectTransfer, exportProject, fetchProjection, importProject } from "./api";
import { useProjectTransfer } from "./project-transfer";

vi.mock("./api", () => ({
	cancelProjectTransfer: vi.fn(),
	exportProject: vi.fn(),
	fetchProjection: vi.fn(),
	importProject: vi.fn(),
}));
const mounted: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of mounted.splice(0)) cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
});
function mount(onImported = vi.fn(async () => {})) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	function Surface() {
		const transfer = useProjectTransfer(onImported);
		return createElement(
			"div",
			null,
			createElement(
				"button",
				{ type: "button", onClick: () => transfer.exportProject({ name: "coffee", root: "/coffee" }) },
				"Export",
			),
			transfer.surface,
		);
	}
	act(() => root.render(createElement(Surface)));
	mounted.push(() => {
		act(() => root.unmount());
		host.remove();
	});
	const choose = async () => {
		const input = host.querySelector("input");
		if (!input) throw new Error("input missing");
		Object.defineProperty(input, "files", { configurable: true, value: [new File(["archive"], "coffee.spool")] });
		await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
	};
	return { host, choose, onImported };
}
it("keeps fast imports quiet and opens the successfully committed project", async () => {
	vi.useFakeTimers();
	const project = { root: "/coffee-2", name: "coffee-2" };
	vi.mocked(importProject).mockResolvedValue(project);
	const { host, choose, onImported } = mount();
	await choose();
	expect(host.textContent).toContain("coffee-2 imported");
	expect(host.textContent).not.toContain("Importing");
	expect(onImported).toHaveBeenCalledWith(project);
});
it("waits for the import result after cancellation so a committed project still opens", async () => {
	vi.useFakeTimers();
	let complete: ((project: { root: string; name: string }) => void) | undefined;
	vi.mocked(importProject).mockImplementation(
		() =>
			new Promise((resolve) => {
				complete = resolve;
			}),
	);
	vi.mocked(cancelProjectTransfer).mockResolvedValue(false);
	const { host, choose, onImported } = mount();
	await choose();
	await act(async () => vi.advanceTimersByTime(159));
	expect(host.textContent).not.toContain("Importing");
	await act(async () => vi.advanceTimersByTime(1));
	expect(host.textContent).toContain("Importing coffee.spool");
	await act(async () =>
		[...host.querySelectorAll("button")].find((button) => button.textContent === "Cancel")?.click(),
	);
	expect(cancelProjectTransfer).toHaveBeenCalledOnce();
	expect(onImported).not.toHaveBeenCalled();
	const project = { root: "/coffee-2", name: "coffee-2" };
	await act(async () => complete?.(project));
	expect(onImported).toHaveBeenCalledWith(project);
	expect(host.textContent).toContain("coffee-2 imported");
});
it("closes export confirmation before preparing the download", async () => {
	vi.mocked(fetchProjection).mockResolvedValue(undefined);
	vi.mocked(exportProject).mockRejectedValue(new Error("Disk unavailable."));
	const { host } = mount();
	await act(async () => host.querySelector("button")?.click());
	expect(host.querySelector("dialog")).not.toBeNull();
	await act(async () =>
		host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
	);
	expect(host.querySelector("dialog")).toBeNull();
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Disk unavailable.");
	expect(exportProject).toHaveBeenCalledWith("/coffee", expect.any(AbortSignal));
});
it("leaves image gestures alone and rejects multiple project files before importing", async () => {
	const { host } = mount();
	const imageData = new DataTransfer();
	imageData.items.add(new File(["image"], "image.png", { type: "image/png" }));
	const drag = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: imageData });
	act(() => window.dispatchEvent(drag));
	expect(drag.defaultPrevented).toBe(false);
	expect(host.querySelector(".project-transfer-drop")).toBeNull();
	const projects = new DataTransfer();
	projects.items.add(new File(["a"], "a.spool"));
	projects.items.add(new File(["b"], "b.spool"));
	const drop = new Event("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(drop, "dataTransfer", {
		value: { files: [new File(["a"], "a.spool"), new File(["b"], "b.spool")] },
	});
	await act(async () => window.dispatchEvent(drop));
	expect(host.textContent).toContain("Choose one project file.");
	expect(importProject).not.toHaveBeenCalled();
});
