// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectCard } from "./api";
import { Home } from "./home";
import { FolderPicker } from "./picker";

function mount(element: React.ReactNode) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return host;
}

const project = (name: string, openedAt: string): ProjectCard => ({
	root: `/tmp/${name}`,
	name,
	openedAt,
	frameCount: 0,
	covers: [],
});

const actions = () => ({
	onOpenProject: vi.fn(),
	onForgetProject: vi.fn(),
	onStart: vi.fn(),
	onFolder: vi.fn(),
	onChangeLocation: vi.fn(),
	location: "~/spool",
});

it("opens the two real first-launch actions and exposes the saved location", () => {
	const callbacks = actions();
	const host = mount(createElement(Home, { projects: [], ...callbacks }));
	expect(host.querySelector(".spool-empty h1")?.textContent).toBe("Start with an idea.");
	expect(host.textContent).toContain("Home / spool");
	const buttons = host.querySelectorAll<HTMLButtonElement>(".spool-empty-actions button");
	act(() => {
		buttons[0]?.click();
		buttons[1]?.click();
	});
	expect(callbacks.onStart).toHaveBeenCalledOnce();
	expect(callbacks.onFolder).toHaveBeenCalledOnce();
});

it("sorts real projects, opens a selected root, and retains removal actions", () => {
	const callbacks = actions();
	const alpha = project("alpha", "2026-09-01T00:00:00Z");
	const beta = project("beta", "2026-09-02T00:00:00Z");
	const host = mount(createElement(Home, { projects: [alpha, beta], ...callbacks }));
	const cards = () => Array.from(host.querySelectorAll(".pj-cover-caption strong")).map((node) => node.textContent);
	expect(cards()).toEqual(["beta", "alpha"]);
	const sort = host.querySelector<HTMLSelectElement>('select[aria-label="Sort projects"]');
	act(() => {
		if (sort) {
			sort.value = "Name";
			sort.dispatchEvent(new Event("change", { bubbles: true }));
		}
	});
	expect(cards()).toEqual(["alpha", "beta"]);
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open alpha"]')?.click());
	expect(callbacks.onOpenProject).toHaveBeenCalledWith(alpha);
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage beta"]')?.click());
	act(() =>
		Array.from(host.querySelectorAll("button"))
			.find((button) => button.textContent === "Remove from spool")
			?.click(),
	);
	expect(callbacks.onForgetProject).toHaveBeenCalledWith(beta);
});

describe("project picker modes", () => {
	function disk() {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					path: "/Users/test",
					parent: "/Users",
					dirs: [{ name: "known", path: "/Users/test/known", isProject: true }],
				}),
			),
		);
	}
	it("focuses start choices and moves to the real naming field from the keyboard", async () => {
		disk();
		const host = mount(
			createElement(FolderPicker, { initial: "start", onOpened: vi.fn(), onClose: vi.fn(), onStart: vi.fn() }),
		);
		await act(async () => {});
		expect(document.activeElement?.textContent).toContain("Start designing");
		act(() =>
			document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
		);
		expect(document.activeElement?.textContent).toContain("New project in a folder");
		act(() => {
			if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
		});
		expect(host.querySelector('[aria-label="Project name"]')).toBe(document.activeElement);
	});
	it("selects a parent without opening or initializing it", async () => {
		disk();
		const onOpened = vi.fn();
		const onLocation = vi.fn(async () => ({ ok: true }));
		const onClose = vi.fn();
		const host = mount(createElement(FolderPicker, { initial: "location", onOpened, onLocation, onClose }));
		await act(async () => {});
		await act(async () =>
			Array.from(host.querySelectorAll("button"))
				.find((button) => button.textContent === "Use this folder")
				?.click(),
		);
		expect(onLocation).toHaveBeenCalledWith("/Users/test");
		expect(onOpened).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledOnce();
	});
});

it("prevents concurrent start submissions and makes creation failures retryable", async () => {
	vi.resetModules();
	let requests = 0;
	let finish: ((response: Response) => void) | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
			if (path === "/api/projects/start") {
				requests++;
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			}
			if (path.endsWith("/events"))
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			if (path === "/api/projects") return Response.json({ projects: [] });
			if (path === "/api/session") return Response.json({ open: [] });
			if (path === "/api/settings") return Response.json({ project: null, entries: [] });
			return Response.json({});
		}),
	);
	const { App } = await import("./app");
	const host = mount(createElement(App));
	await act(async () => {});
	const button = host.querySelector<HTMLButtonElement>(".spool-empty-actions button");
	act(() => {
		button?.click();
		button?.click();
	});
	expect(requests).toBe(1);
	expect(button?.disabled).toBe(true);
	await act(async () => finish?.(Response.json({ error: "Choose a writable folder." }, { status: 409 })));
	expect(host.querySelector('[role="alert"]')?.textContent).toContain("Choose a writable folder.");
	expect(button?.disabled).toBe(false);
	act(() => button?.click());
	expect(requests).toBe(2);
	await act(async () => finish?.(Response.json({ error: "Choose a writable folder." }, { status: 409 })));
});

it("does not claim first launch while the registry is still loading", () => {
	const host = mount(createElement(Home, { projects: [], loading: true, ...actions() }));
	expect(host.querySelector('main[aria-busy="true"]')).not.toBeNull();
	expect(host.textContent).not.toContain("Start with an idea.");
	expect(host.querySelector(".pj-navigation")).not.toBeNull();
});
