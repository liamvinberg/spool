// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { PlaceChooser } from "./place-chooser";

function mount(purpose: "open" | "location") {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
		this.setAttribute("open", "");
	};
	HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
		this.removeAttribute("open");
	};
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const onChoose = vi.fn();
	const onCancel = vi.fn();
	act(() => root.render(createElement(PlaceChooser, { purpose, start: "~", onChoose, onCancel })));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return { host, root, onChoose, onCancel };
}

it("is the system's panel in the Mac app, asked once, and answers with what it picked or a cancel", async () => {
	const chooseDirectory = vi.fn().mockResolvedValueOnce("/Users/ada/code/kvitt").mockResolvedValueOnce(null);
	vi.stubGlobal("spoolCanvasWindow", { onCommand: () => () => {}, setCanvasActive: () => {}, chooseDirectory });
	const first = mount("open");
	await act(async () => {});
	expect(chooseDirectory).toHaveBeenCalledExactlyOnceWith({ purpose: "open", defaultPath: "~" });
	expect(first.onChoose).toHaveBeenCalledExactlyOnceWith("/Users/ada/code/kvitt");
	expect(first.host.querySelector("dialog")).toBeNull();
	vi.stubGlobal("spoolCanvasWindow", { onCommand: () => () => {}, setCanvasActive: () => {}, chooseDirectory });
	const second = mount("location");
	await act(async () => {});
	expect(chooseDirectory).toHaveBeenLastCalledWith({ purpose: "location", defaultPath: "~" });
	expect(second.onCancel).toHaveBeenCalledOnce();
});

it("in a browser, lists a folder's .spool files for Open… and hands on a pasted link as it is", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), window.location.href);
			const path = url.searchParams.get("path") ?? "/Users/ada";
			return Response.json({
				path,
				parent: "/Users",
				isProject: false,
				dirs: [{ name: "code", path: `${path}/code`, isProject: false }],
				spools: [{ name: "kaffe-menu.spool", path: `${path}/kaffe-menu.spool` }],
			});
		}),
	);
	const { host, onChoose } = mount("open");
	await act(async () => {});
	const rows = () => [...host.querySelectorAll('[role="option"]')].map((row) => row.getAttribute("aria-label"));
	expect(rows()).toEqual(["Select code", "Select kaffe-menu.spool"]);
	await act(async () =>
		host
			.querySelector('[aria-label="Select kaffe-menu.spool"]')
			?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
	);
	expect(onChoose).toHaveBeenLastCalledWith("/Users/ada/kaffe-menu.spool");
	const input = host.querySelector<HTMLInputElement>("dialog input");
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
			input,
			"git@github.com:t/tides.git",
		);
		input?.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Open")?.click());
	expect(onChoose).toHaveBeenLastCalledWith("git@github.com:t/tides.git");
});
