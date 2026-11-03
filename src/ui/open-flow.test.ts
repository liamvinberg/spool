// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Finding } from "./api";
import { droppedOf } from "./open-drop";
import { useOpen } from "./open-flow";

/** The daemon as Open… sees it: one finding per given, and every write it was asked for. */
function daemon(findings: Record<string, Finding>, answers: Record<string, () => Response> = {}) {
	const writes: { path: string; body: unknown }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname === "/api/projects/find")
				return Response.json(findings[url.searchParams.get("given") ?? ""] ?? { kind: "nothing", says: "?" });
			if (url.pathname === "/api/projects/clone/progress") return Response.json(null);
			writes.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
			const answer = answers[url.pathname];
			if (answer) return answer();
			const path = (writes.at(-1)?.body as { path?: string } | null)?.path ?? "/x";
			return Response.json({ root: path, name: path.split("/").at(-1) });
		}),
	);
	return writes;
}

function mount(home = true) {
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
	const onOpened = vi.fn();
	let take: (given: string) => void = () => {};
	function Surface() {
		const open = useOpen({ home, onOpened });
		take = open.take;
		return createElement("div", null, createElement("input", { "aria-label": "field" }), open.surface);
	}
	act(() => root.render(createElement(Surface)));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	const settle = () => act(async () => {});
	return {
		host,
		onOpened,
		take: async (given: string) => {
			await act(async () => take(given));
			await settle();
		},
		press: async (label: string) => {
			const found = [...host.querySelectorAll("button")].find((node) => node.textContent === label);
			if (!found) throw new Error(`no ${label}`);
			await act(async () => found.click());
			await settle();
		},
		settle,
	};
}

it("opens a folder with designs at once, with no sheet", async () => {
	const writes = daemon({ "/u/kaffe/src": { kind: "project", root: "/u/kaffe", name: "kaffe" } });
	const { host, take, onOpened } = mount();
	await take("/u/kaffe/src");
	expect(writes).toEqual([{ path: "/api/projects/open", body: { path: "/u/kaffe" } }]);
	expect(onOpened).toHaveBeenCalledWith({ kind: "opened", root: "/u/kaffe", name: "kaffe" });
	expect(host.querySelector("dialog")).toBeNull();
});

it("asks before designing in a code folder, and makes nothing until asked", async () => {
	const writes = daemon({
		"/u/kvitt": { kind: "folder", path: "/u/kvitt", name: "kvitt", branch: "main", code: true, items: 7 },
	});
	const { host, take, press, onOpened } = mount();
	await take("/u/kvitt");
	expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe("kvitt");
	expect(host.querySelector("dialog")?.textContent).toContain("adds design/ beside the code");
	expect(writes).toEqual([]);
	await press("Design in this folder");
	expect(writes).toEqual([{ path: "/api/projects/init", body: { path: "/u/kvitt" } }]);
	expect(onOpened).toHaveBeenCalledOnce();
	expect(host.querySelector("dialog")).toBeNull();
});

it("clones a repo, then reads the clone again and asks to design in it", async () => {
	const writes = daemon(
		{
			"https://github.com/t/tides": {
				kind: "repo",
				url: "https://github.com/t/tides",
				name: "tides",
				repo: "github.com/t/tides",
				branch: "main",
				into: "/u/spool/tides",
			},
		},
		{
			"/api/projects/clone": () =>
				Response.json({
					kind: "folder",
					path: "/u/spool/tides",
					name: "tides",
					branch: "main",
					code: true,
					items: 3,
				}),
		},
	);
	const { host, take, press, onOpened } = mount();
	await take("https://github.com/t/tides");
	expect(host.querySelector("dialog")?.textContent).toContain("git clone into /u/spool/tides");
	await press("Clone");
	expect(writes[0]).toMatchObject({ path: "/api/projects/clone", body: { url: "https://github.com/t/tides" } });
	expect(host.querySelector("dialog")?.textContent).toContain("Design in this folder");
	expect(onOpened).not.toHaveBeenCalled();
});

it("says plainly when nothing answers, keeps what was given to fix, and tries the fix", async () => {
	daemon({
		"https://github.com/t/tide": { kind: "nothing", says: "Nothing answers at this link." },
		"https://github.com/t/tides": { kind: "project", root: "/u/tides", name: "tides" },
	});
	const { host, take, press, onOpened } = mount();
	await take("https://github.com/t/tide");
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Nothing answers at this link.");
	const field = host.querySelector<HTMLInputElement>('dialog input[aria-label="What was given"]');
	expect(field?.value).toBe("https://github.com/t/tide");
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
			field,
			"https://github.com/t/tides",
		);
		field?.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await press("Try again");
	expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({ root: "/u/tides" }));
});

it("takes a paste on Home outside a field, and leaves a field's paste to the field", async () => {
	const writes = daemon({ "~/kaffe": { kind: "project", root: "/u/kaffe", name: "kaffe" } });
	const { host, settle } = mount();
	const paste = async (target: EventTarget) => {
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", { value: { getData: () => "~/kaffe" } });
		await act(async () => target.dispatchEvent(event));
		await settle();
	};
	await paste(host.querySelector("input") as HTMLInputElement);
	expect(writes).toEqual([]);
	await paste(document.body);
	expect(writes).toEqual([{ path: "/api/projects/open", body: { path: "/u/kaffe" } }]);
});

it("leaves a paste alone while a project is in front", async () => {
	const writes = daemon({ "~/kaffe": { kind: "project", root: "/u/kaffe", name: "kaffe" } });
	const { settle } = mount(false);
	const event = new Event("paste", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: { getData: () => "~/kaffe" } });
	await act(async () => document.body.dispatchEvent(event));
	await settle();
	expect(writes).toEqual([]);
});

it("reads a drop: the Mac app's path, a browser's .spool bytes, a link, and what a browser can't open", () => {
	const file = new File(["zip"], "kaffe-menu.spool");
	const data = (files: File[], entry?: { isDirectory: boolean }, text = "") => ({
		files: files as unknown as FileList,
		items: files.map(() => ({ webkitGetAsEntry: () => entry ?? null })) as unknown as DataTransferItemList,
		getData: (type: string) => (type === "text/uri-list" ? text : ""),
	});
	expect(droppedOf(data([file]), () => "/u/Downloads/kaffe-menu.spool")).toEqual({
		kind: "given",
		given: "/u/Downloads/kaffe-menu.spool",
	});
	expect(droppedOf(data([file]))).toEqual({ kind: "bytes", file });
	expect(droppedOf(data([new File([], "kvitt")], { isDirectory: true }))?.kind).toBe("refused");
	expect(droppedOf(data([file, file]))).toEqual({ kind: "refused", says: "Drop one folder or one .spool file." });
	expect(droppedOf(data([], undefined, "# comment\r\nhttps://github.com/t/tides\r\n"))).toEqual({
		kind: "given",
		given: "https://github.com/t/tides",
	});
	expect(droppedOf(data([]))).toBeUndefined();
});
