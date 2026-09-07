// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectCard } from "./api";
import { Home } from "./home";
import { ProjectPicker } from "./picker";

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
	onTrashProject: vi.fn(),
	onRenameProject: vi.fn(),
	onStart: vi.fn(),
	onFolder: vi.fn(),
	onSettings: vi.fn(),
});

it("opens the two first-launch actions without a separate location choice", () => {
	const callbacks = actions();
	const host = mount(createElement(Home, { projects: [], ...callbacks }));
	expect(host.querySelector(".spool-empty h1")?.textContent).toBe("Start with an idea.");
	expect(host.textContent).not.toContain("Save projects in");
	const buttons = host.querySelectorAll<HTMLButtonElement>(".spool-empty-actions button");
	act(() => {
		buttons[0]?.click();
		buttons[1]?.click();
	});
	expect(callbacks.onStart).toHaveBeenCalledOnce();
	expect(callbacks.onFolder).toHaveBeenCalledOnce();
	act(() => button(host, "Settings").click());
	expect(callbacks.onSettings).toHaveBeenCalledOnce();
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
			.find((button) => button.textContent === "Hide from Spool")
			?.click(),
	);
	expect(callbacks.onForgetProject).toHaveBeenCalledWith(beta);
	expect(callbacks.onTrashProject).not.toHaveBeenCalled();
});

it("offers rename for a project that already has frames", () => {
	const callbacks = actions();
	const existing = { ...project("coffee", "2026-09-01T00:00:00Z"), frameCount: 4 };
	const host = mount(createElement(Home, { projects: [existing], ...callbacks }));
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage coffee"]')?.click());
	act(() => button(host, "Rename…").click());
	expect(callbacks.onRenameProject).toHaveBeenCalledExactlyOnceWith(existing);
	expect(host.textContent).not.toContain("Rename…");
});

function button(host: HTMLElement, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

function type(input: HTMLInputElement | null, value: string) {
	if (!input) throw new Error("Missing input");
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("project creation and folder selection", () => {
	function disk() {
		const requests: { path: string; body: unknown }[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
				if (url.pathname === "/api/fs/list") {
					const path = url.searchParams.get("path") ?? "/Users/test";
					return Response.json({
						path,
						parent: path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/",
						isProject: path.endsWith("/existing"),
						dirs: [
							{ name: "src", path: `${path}/src`, isProject: false },
							{ name: "existing", path: `${path}/existing`, isProject: true },
						],
					});
				}
				requests.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
				if (url.pathname === "/api/settings")
					return Response.json({ key: "projects.location", value: "/Users/test/coffee/src" });
				return Response.json({ root: "/Users/test/coffee", name: "coffee" });
			}),
		);
		return requests;
	}
	it("initializes the exact codebase with one confirmation even when it has child folders", async () => {
		const requests = disk();
		const onOpened = vi.fn();
		const host = mount(createElement(ProjectPicker, { location: "/Users/test/coffee", onOpened, onClose: vi.fn() }));
		await act(async () => {});
		expect(host.querySelector(".picker-footer code")?.textContent).toBe("~/coffee");
		expect(requests).toEqual([]);
		await act(async () => button(host, "Add spool here").click());
		expect(requests).toEqual([{ path: "/api/projects/init", body: { path: "/Users/test/coffee" } }]);
		expect(onOpened).toHaveBeenCalledOnce();
	});
	it("selects without writing, confirms the selected location, and uses the arrow to go up one directory", async () => {
		const requests = disk();
		const onLocation = vi.fn(async () => ({ ok: true }));
		const host = mount(
			createElement(ProjectPicker, {
				initial: "location",
				location: "/Users/test/coffee",
				onOpened: vi.fn(),
				onLocation,
				onClose: vi.fn(),
			}),
		);
		await act(async () => {});
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Select src"]')?.click());
		expect(host.querySelector(".picker-footer code")?.textContent).toBe("~/coffee/src");
		expect(requests).toEqual([]);
		await act(async () => button(host, "Save projects here").click());
		expect(onLocation).toHaveBeenCalledExactlyOnceWith("/Users/test/coffee/src");
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Parent folder"]')?.click());
		expect(host.querySelector(".picker-footer code")?.textContent).toBe("~");
		expect(requests).toEqual([]);
	});
	it("opens an existing project without initializing it or requiring a second Enter", async () => {
		const requests = disk();
		const host = mount(
			createElement(ProjectPicker, { location: "/Users/test/coffee", onOpened: vi.fn(), onClose: vi.fn() }),
		);
		await act(async () => {});
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Select existing"]')?.click());
		await act(async () =>
			host.querySelector("input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
		);
		expect(requests).toEqual([{ path: "/api/projects/open", body: { path: "/Users/test/coffee/existing" } }]);
	});
	it("keeps a draft when canceling location selection and changes the default only when selected", async () => {
		const requests = disk();
		const host = mount(
			createElement(ProjectPicker, {
				initial: "start",
				location: "/Users/test/coffee",
				onOpened: vi.fn(),
				onClose: vi.fn(),
			}),
		);
		await act(async () => {});
		act(() => type(host.querySelector("input"), "workshop"));
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose project location"]')?.click());
		act(() => host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })));
		expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("workshop");
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose project location"]')?.click());
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Select src"]')?.click());
		await act(async () => button(host, "Choose location").click());
		expect(requests).toEqual([]);
		expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("workshop");
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose project location"]')?.click());
		act(() => host.querySelector<HTMLInputElement>('[type="checkbox"]')?.click());
		await act(async () => button(host, "Choose location").click());
		expect(requests).toEqual([
			{ path: "/api/settings", body: { key: "projects.location", value: "/Users/test/coffee/src" } },
		]);
		await act(async () =>
			host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
		);
		expect(requests.at(-1)).toEqual({
			path: "/api/projects/create",
			body: { path: "/Users/test/coffee/src", name: "workshop" },
		});
	});
	it("uses the custom picker in the desktop app too", async () => {
		disk();
		const chooseDirectory = vi.fn();
		vi.stubGlobal("spoolCanvasWindow", { onCommand: () => () => {}, setCanvasActive: () => {}, chooseDirectory });
		const host = mount(
			createElement(ProjectPicker, {
				initial: "start",
				location: "/Users/test/coffee",
				onOpened: vi.fn(),
				onClose: vi.fn(),
			}),
		);
		await act(async () => {});
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose project location"]')?.click());
		expect(host.querySelector('[aria-label="Search folders or paste a path"]')).not.toBeNull();
		expect(chooseDirectory).not.toHaveBeenCalled();
	});
	it("allows unnamed creation, prevents concurrent submits, and retains a failed draft", async () => {
		let finish: ((response: Response) => void) | undefined;
		const writes: unknown[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (!init?.body)
					return Response.json({ path: "/Users/test", parent: "/Users", isProject: false, dirs: [] });
				writes.push(JSON.parse(String(init.body)));
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			}),
		);
		const onOpened = vi.fn();
		const host = mount(
			createElement(ProjectPicker, { initial: "start", location: "~/spool", onOpened, onClose: vi.fn() }),
		);
		const submit = () =>
			host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await act(async () => {
			submit();
			submit();
		});
		expect(writes).toEqual([{ path: "~/spool", name: "" }]);
		expect(host.querySelector("fieldset")?.disabled).toBe(true);
		await act(async () => finish?.(Response.json({ error: "Choose a writable folder." }, { status: 409 })));
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("Choose a writable folder.");
		act(() => type(host.querySelector("input"), " coffee "));
		await act(async () => submit());
		expect(writes.at(-1)).toEqual({ path: "~/spool", name: "coffee" });
		await act(async () => finish?.(Response.json({ root: "/Users/test/spool/coffee", name: "coffee" })));
		expect(onOpened).toHaveBeenCalledOnce();
	});
});

it("opens the same creation form from Home and the tab strip without creating on click", {
	timeout: 15_000,
}, async () => {
	vi.resetModules();
	const writes: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
			if (init?.method === "POST") writes.push(path);
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
	act(() => host.querySelector<HTMLButtonElement>(".spool-empty-actions button")?.click());
	expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe("New project");
	expect(document.activeElement?.getAttribute("placeholder")).toBe("Project name (optional)");
	act(() => host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })));
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="New project"]')?.click());
	expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe("New project");
	expect(writes).toEqual([]);
});

it("does not claim first launch while the registry is still loading", () => {
	const host = mount(createElement(Home, { projects: [], loading: true, ...actions() }));
	expect(host.querySelector('main[aria-busy="true"]')).not.toBeNull();
	expect(host.textContent).not.toContain("Start with an idea.");
	expect(host.querySelector(".pj-navigation")).not.toBeNull();
});

it.each([204, 503])(
	"keeps a project hidden until its write finishes, restoring it only on failure (%s)",
	async (status) => {
		vi.resetModules();
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const coffee = project("coffee", "2026-09-01T00:00:00Z");
		let forgotten = false;
		let finish: ((response: Response) => void) | undefined;
		let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
		let holdRead = false;
		let finishOldRead: (() => void) | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
				if (path === "/api/projects/forget") {
					expect(init?.keepalive).toBe(true);
					expect(JSON.parse(String(init?.body))).toEqual({ root: coffee.root });
					return new Promise<Response>((resolve) => {
						finish = resolve;
					});
				}
				if (path.endsWith("/events"))
					return new Response(
						new ReadableStream<Uint8Array>({
							start: (controller) => {
								stream = controller;
							},
						}),
						{
							headers: { "content-type": "text/event-stream" },
						},
					);
				if (path === "/api/projects") {
					const response = Response.json({ projects: forgotten ? [] : [coffee] });
					if (holdRead) {
						holdRead = false;
						return new Promise<Response>((resolve) => {
							finishOldRead = () => resolve(response);
						});
					}
					return response;
				}
				if (path === "/api/session") return Response.json({ open: forgotten ? [] : [coffee.root] });
				if (path === "/api/settings") return Response.json({ project: null, entries: [] });
				return Response.json({});
			}),
		);
		const { App } = await import("./app");
		const host = mount(createElement(App));
		await act(async () => {});
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage coffee"]')?.click());
		act(() => button(host, "Hide from Spool").click());
		expect(host.querySelector('[aria-label="Open coffee"]')).toBeNull();
		expect(finish).toBeDefined();
		expect(host.textContent).not.toContain("Undo");
		expect(host.textContent).not.toContain("Hidden coffee");
		await act(async () => vi.advanceTimersByTimeAsync(5000));
		expect(host.querySelector('[aria-label="Open coffee"]')).toBeNull();
		expect(host.querySelector('[aria-label="Close coffee"]')).toBeNull();
		holdRead = true;
		await act(async () => stream?.enqueue(new TextEncoder().encode('event: app\ndata: {"kind":"registry"}\n\n')));
		expect(finishOldRead).toBeDefined();
		forgotten = status === 204;
		await act(async () => finish?.(new Response(null, { status })));
		await act(async () => finishOldRead?.());
		expect(host.querySelector('[aria-label="Open coffee"]') === null).toBe(forgotten);
		expect(host.querySelector('[aria-label="Close coffee"]') === null).toBe(forgotten);
	},
);

it("confirms trashing the whole folder, supports cancellation and retries failures before removing the card", async () => {
	vi.resetModules();
	const coffee = project("coffee", "2026-09-01T00:00:00Z");
	let trashed = false;
	let requests = 0;
	let finish: ((response: Response) => void) | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
			if (path === "/api/projects/trash") {
				requests++;
				expect(JSON.parse(String(init?.body))).toEqual({ root: coffee.root });
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			}
			if (path.endsWith("/events"))
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			if (path === "/api/projects") return Response.json({ projects: trashed ? [] : [coffee] });
			if (path === "/api/session") return Response.json({ open: trashed ? [] : [coffee.root] });
			if (path === "/api/settings") return Response.json({ project: null, entries: [] });
			return Response.json({});
		}),
	);
	const { App } = await import("./app");
	const host = mount(createElement(App));
	await act(async () => {});
	const openDialog = () => {
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage coffee"]')?.click());
		act(() => button(host, "Move to Trash…").click());
	};
	expect(host.querySelector('[aria-label="Close coffee"]')).not.toBeNull();
	openDialog();
	expect(requests).toBe(0);
	expect(host.querySelector("dialog")?.textContent).toContain("entire project folder and everything inside it");
	expect(host.querySelector("dialog code")?.textContent).toBe(coffee.root);
	expect(document.activeElement?.textContent).toBe("Cancel");
	expect(button(host, "Move to Trash").classList.contains("home-action-danger")).toBe(true);
	act(() => button(host, "Cancel").click());
	expect(host.querySelector("dialog")).toBeNull();
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Manage coffee");
	expect(requests).toBe(0);
	openDialog();
	const submit = () =>
		host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	await act(async () => {
		submit();
		submit();
	});
	expect(requests).toBe(1);
	expect(host.querySelector("fieldset")?.disabled).toBe(true);
	await act(async () => finish?.(Response.json({ error: "Trash unavailable" }, { status: 409 })));
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Trash unavailable");
	expect(host.querySelector('[aria-label="Open coffee"]')).not.toBeNull();
	await act(async () => submit());
	expect(requests).toBe(2);
	trashed = true;
	await act(async () => finish?.(new Response(null, { status: 204 })));
	expect(host.querySelector("dialog")).toBeNull();
	expect(host.querySelector('[aria-label="Open coffee"]')).toBeNull();
	expect(host.querySelector('[aria-label="Close coffee"]')).toBeNull();
});
