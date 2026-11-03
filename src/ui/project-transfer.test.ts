// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { exportProject, fetchProjection } from "./api";
import { useProjectExport } from "./project-transfer";

vi.mock("./api", () => ({
	exportProject: vi.fn(),
	fetchProjection: vi.fn(),
}));
const mounted: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of mounted.splice(0)) cleanup();
	vi.clearAllMocks();
});
function mount() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	function Surface() {
		const transfer = useProjectExport();
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
	return { host };
}
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
