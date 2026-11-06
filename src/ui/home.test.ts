// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { AccountFoot } from "./account-foot";
import type { CloudAccountState, ProjectCard } from "./api";
import { type Everywhere, Home } from "./home";

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
	onOpen: vi.fn(),
});

it("opens the two first-launch actions", () => {
	const callbacks = actions();
	const host = mount(createElement(Home, { projects: [], ...callbacks }));
	expect(host.querySelector(".pj-welcome h1")?.textContent).toBe("Start with an idea.");
	const buttons = host.querySelectorAll<HTMLButtonElement>(".pj-welcome button");
	act(() => {
		buttons[0]?.click();
		buttons[1]?.click();
	});
	expect(callbacks.onStart).toHaveBeenCalledOnce();
	expect(callbacks.onOpen).toHaveBeenCalledOnce();
	expect(buttons).toHaveLength(2);
	// settings opens from the window bar's gear; the sidebar keeps "Settings" for a team's own
	expect(host.querySelector('nav[aria-label="Home actions"]')).toBeNull();
});

it("sorts real projects, opens a selected root, and retains removal actions", () => {
	const callbacks = actions();
	const alpha = project("alpha", "2026-09-01T00:00:00Z");
	const beta = project("beta", "2026-09-02T00:00:00Z");
	const host = mount(createElement(Home, { projects: [alpha, beta], ...callbacks }));
	const cards = () => Array.from(host.querySelectorAll(".pj-cover-caption strong")).map((node) => node.textContent);
	expect(cards()).toEqual(["beta", "alpha"]);
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Sort projects: Last opened"]')?.click());
	expect(host.querySelector('[role="menuitemcheckbox"][aria-checked="true"]')?.textContent).toBe("Last opened");
	act(() => button(host, "A to Z").click());
	expect(cards()).toEqual(["alpha", "beta"]);
	expect(host.querySelector('[role="menu"]')).toBeNull();
	expect(host.querySelector('[aria-label="Sort projects: A to Z"]')).not.toBeNull();
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

it("says on its cover that a project is no longer synced with its team, long after it ended", () => {
	const ended = { ...project("checkout", "2026-09-01T00:00:00Z"), ended: "devosurf" };
	const host = mount(createElement(Home, { projects: [ended], ...actions() }));
	expect(host.querySelector(".pj-cover-button")?.textContent).toContain("no longer synced with devosurf");
});

describe("a project whose design/ moved into a team this account can't edit", () => {
	const moved = (standing: "outside" | "viewer" | "signed-out"): ProjectCard => ({
		...project("kaffe", "2026-09-01T00:00:00Z"),
		moved: {
			team: "tidemark",
			url: "https://spool.page/tidemark/kaffe",
			standing,
			commit: { hash: "3f2a1c9d0e", author: "Ada Lind", date: new Date().toISOString() },
			leftover: ["checkout-tip", "receipt-dark"],
		},
	});
	const sheet = (host: HTMLElement) => document.querySelector<HTMLElement>("[data-moved-sheet]") ?? host;
	const buttons = () =>
		Array.from(document.querySelectorAll("[data-moved-sheet] footer button")).map((one) => one.textContent);

	it("says on its cover where design/ went and who moved it, and opens the sheet instead of the canvas", () => {
		const callbacks = actions();
		const host = mount(createElement(Home, { projects: [moved("outside")], ...callbacks }));
		const cover = host.querySelector(".pj-cover-button");
		expect(cover?.textContent).toContain("design/ moved to tidemark");
		expect(cover?.querySelector('[data-line="when"]')?.textContent).toBe("today · moved by Ada Lind");
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open kaffe"]')?.click());
		expect(callbacks.onOpenProject).not.toHaveBeenCalled();
		const shown = sheet(host);
		expect(shown.dataset.movedSheet).toBe("outside");
		expect(shown.textContent).toContain("kaffe moved to tidemark");
		expect(shown.textContent).toContain("Ada Lind moved it out of git in 3f2a1c9");
		expect(shown.textContent).toContain("Ask Ada Lind to invite you, and it fills in here by itself.");
		expect(Array.from(shown.querySelectorAll("[data-leftover] li")).map((one) => one.textContent)).toEqual([
			"frames/checkout-tip",
			"frames/receipt-dark",
		]);
		expect(buttons()).toEqual(["Remove from Home", "OK"]);
		act(() => button(shown, "OK").click());
		expect(document.querySelector("[data-moved-sheet]")).toBeNull();
	});

	it("offers a viewer the browser and a signed-out Mac Sign in", () => {
		for (const [standing, primary] of [
			["viewer", "Open in browser"],
			["signed-out", "Sign in"],
		] as const) {
			const host = mount(createElement(Home, { projects: [moved(standing)], ...actions() }));
			act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open kaffe"]')?.click());
			expect(sheet(host).dataset.movedSheet).toBe(standing);
			expect(sheet(host).querySelector("[data-leftover]")).toBeNull();
			expect(buttons()).toEqual(["Remove from Home", primary]);
			act(() => button(sheet(host), "Remove from Home").click());
		}
	});

	it("hides the project from Home with Remove from Home", () => {
		const callbacks = actions();
		const card = moved("outside");
		const host = mount(createElement(Home, { projects: [card], ...callbacks }));
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open kaffe"]')?.click());
		act(() => button(sheet(host), "Remove from Home").click());
		expect(callbacks.onForgetProject).toHaveBeenCalledExactlyOnceWith(card);
		expect(document.querySelector("[data-moved-sheet]")).toBeNull();
	});
});

it("shows a team project once however many local copies this Mac holds, opening the latest", () => {
	const callbacks = actions();
	const team = { url: "https://spool.page/devosurf/checkout", team: "devosurf", project: "checkout" };
	const checkout = { ...project("checkout", "2026-09-01T00:00:00Z"), team };
	const lane = { ...project("lane", "2026-09-03T00:00:00Z"), team };
	const solo = project("solo", "2026-09-02T00:00:00Z");
	const host = mount(createElement(Home, { projects: [checkout, lane, solo], ...callbacks }));
	const cards = () => Array.from(host.querySelectorAll(".pj-cover-caption strong")).map((node) => node.textContent);
	expect(cards()).toEqual(["lane", "solo"]);
	expect(host.querySelector(".pj-cover-button")?.textContent).toContain("2 copies on this Mac");
	expect(host.querySelector('[aria-label="2 projects"]')?.textContent).toBe("2");
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open lane"]')?.click());
	expect(callbacks.onOpenProject).toHaveBeenCalledWith(lane);
});

describe("a card's quiet line", () => {
	const line = (host: HTMLElement, which: "when" | "where", name: string) =>
		host.querySelector(`[aria-label="Open ${name}"] [data-line="${which}"]`);

	it("says when at rest, and where it lives and how big under the pointer or focus", () => {
		const shop = { ...project("shop", new Date().toISOString()), root: "/Users/ada/shop", frameCount: 3 };
		const host = mount(createElement(Home, { projects: [shop], ...actions() }));
		expect(line(host, "when", "shop")?.textContent).toBe("today");
		expect(line(host, "when", "shop")?.classList).toContain("group-hover/project:opacity-0");
		expect(line(host, "when", "shop")?.classList).toContain("group-focus-within/project:opacity-0");
		const where = line(host, "where", "shop");
		expect(where?.textContent).toBe("~/shop · 3 frames");
		expect(where?.classList).toContain("opacity-0");
		expect(where?.classList).toContain("group-hover/project:opacity-100");
		expect(where?.classList).toContain("group-focus-within/project:opacity-100");
	});

	it("holds where it lives while the card's menu is open", () => {
		const host = mount(createElement(Home, { projects: [project("shop", "2026-09-01T00:00:00Z")], ...actions() }));
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage shop"]')?.click());
		expect(line(host, "where", "shop")?.classList).toContain("opacity-100");
		expect(line(host, "when", "shop")?.classList).toContain("opacity-0");
	});

	it("shows where it lives on a card a search finds only by its path", () => {
		const host = mount(
			createElement(Home, {
				projects: [project("shop", "2026-09-02T00:00:00Z"), project("tmpfile", "2026-09-01T00:00:00Z")],
				...actions(),
			}),
		);
		act(() => type(host.querySelector('input[type="search"]'), "tmp"));
		expect(line(host, "where", "shop")?.classList).toContain("opacity-100");
		expect(line(host, "where", "tmpfile")?.classList).not.toContain("opacity-100");
		expect(host.querySelector('[aria-label="2 of 2 projects"]')).not.toBeNull();
	});

	it("names a team copy's team at rest, and says when its sync is paused", () => {
		const team = { url: "https://spool.page/devosurf/checkout", team: "devosurf", project: "checkout" };
		const paused = { ...project("checkout", new Date().toISOString()), team, syncPaused: "limit" };
		const host = mount(createElement(Home, { projects: [paused], ...actions() }));
		expect(line(host, "when", "checkout")?.textContent).toBe("devosurf · sync paused · today");
	});
});

describe("the head's two buttons", () => {
	it("starts a project from New project and opens existing work from Open…", () => {
		const callbacks = actions();
		const host = mount(createElement(Home, { projects: [project("shop", "2026-09-01T00:00:00Z")], ...callbacks }));
		act(() => button(host, "New project").click());
		expect(callbacks.onStart).toHaveBeenCalledOnce();
		act(() => button(host, "Open…").click());
		expect(callbacks.onOpen).toHaveBeenCalledOnce();
	});
});

describe("a project's picture on its cover", () => {
	const thumbnail = { path: "design/shared/thumbnail.png", hash: "a".repeat(32) };
	const pictureOf = (host: HTMLElement) => host.querySelector<HTMLImageElement>(".pj-cover-art img");

	it("fits the top-left frame's still whole on the canvas colour, never cropped", () => {
		const shot = {
			...project("shop", "2026-09-01T00:00:00Z"),
			covers: [{ frame: "home", cover: { hash: "b".repeat(32) } }],
		};
		const host = mount(createElement(Home, { projects: [shot], ...actions() }));
		const picture = pictureOf(host);
		expect(picture?.getAttribute("src")).toBe(`/covers/shop/home/${"b".repeat(32)}`);
		expect(picture?.classList).toContain("object-contain");
		expect(picture?.classList).not.toContain("object-cover");
		expect(host.querySelector(".pj-cover-art")?.classList).toContain("bg-surface-canvas");
	});

	it("shows the thumbnail file over the top-left frame, fitted the same way", () => {
		const shot = {
			...project("shop", "2026-09-01T00:00:00Z"),
			covers: [{ frame: "home", cover: { hash: "b".repeat(32) } }],
			thumbnail,
		};
		const host = mount(createElement(Home, { projects: [shot], ...actions() }));
		const picture = pictureOf(host);
		expect(picture?.getAttribute("src")).toBe(`/thumbnails/shop/${"a".repeat(32)}`);
		expect(picture?.classList).toContain("object-contain");
		expect(host.querySelectorAll(".pj-cover-art img")).toHaveLength(1);
	});

	it("keeps the empty card for a project with no frames and no thumbnail", () => {
		const host = mount(createElement(Home, { projects: [project("empty", "2026-09-01T00:00:00Z")], ...actions() }));
		expect(pictureOf(host)).toBeNull();
	});

	it("shows a team project's thumbnail on its one card", () => {
		const team = { url: "https://spool.page/devosurf/checkout", team: "devosurf", project: "checkout" };
		const older = { ...project("checkout", "2026-09-01T00:00:00Z"), team, thumbnail };
		const lane = { ...project("lane", "2026-09-03T00:00:00Z"), team, thumbnail };
		const host = mount(createElement(Home, { projects: [older, lane], ...actions() }));
		expect(host.querySelectorAll(".pj-cover-art img")).toHaveLength(1);
		expect(pictureOf(host)?.getAttribute("src")).toBe(`/thumbnails/lane/${"a".repeat(32)}`);
	});

	it("offers Remove thumbnail beside Remove icon only while the project has the file", () => {
		const onRemoveThumbnail = vi.fn();
		const withFile = { ...project("shop", "2026-09-02T00:00:00Z"), thumbnail };
		const without = project("plain", "2026-09-01T00:00:00Z");
		const host = mount(
			createElement(Home, {
				projects: [withFile, without],
				...actions(),
				onChangeIcon: vi.fn(),
				onRemoveIcon: vi.fn(),
				onRemoveThumbnail,
			}),
		);
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage plain"]')?.click());
		expect(host.textContent).not.toContain("Remove thumbnail");
		act(() => host.querySelector<HTMLButtonElement>('[aria-label="Manage shop"]')?.click());
		act(() => button(host, "Remove thumbnail").click());
		expect(onRemoveThumbnail).toHaveBeenCalledExactlyOnceWith(withFile);
		expect(host.textContent).not.toContain("Remove thumbnail");
	});
});

describe("the account at the foot of Home's sidebar", () => {
	const foot = (account: CloudAccountState) => {
		const calls = { onSignIn: vi.fn(), onReopen: vi.fn(), onCancel: vi.fn(), onSignOut: vi.fn() };
		const host = mount(
			createElement(Home, {
				projects: [],
				...actions(),
				account: createElement(AccountFoot, { account, ...calls }),
			}),
		);
		return { host, calls };
	};

	it("offers Sign in while this Mac is signed out", () => {
		const { host, calls } = foot({ state: "signed-out" });
		expect(host.querySelector(".pj-navigation-foot")?.textContent).toContain(
			"Sign in to share links and join a team.",
		);
		act(() => button(host, "Sign in").click());
		expect(calls.onSignIn).toHaveBeenCalledOnce();
	});

	it("says why the last sign-in did not finish, and offers Sign in again", () => {
		const { host, calls } = foot({ state: "signed-out", failed: "spool.page could not be reached" });
		expect(host.querySelector('[role="alert"]')?.textContent).toBe(
			"Sign-in didn’t finish: spool.page could not be reached",
		);
		expect(host.textContent).not.toContain("Sign in to share links");
		act(() => button(host, "Sign in").click());
		expect(calls.onSignIn).toHaveBeenCalledOnce();
	});

	it("waits for the browser, and opens it again or cancels", () => {
		const { host, calls } = foot({ state: "signing-in" });
		expect(host.textContent).toContain("Finish in your browser");
		act(() => button(host, "Open it again").click());
		act(() => button(host, "Cancel").click());
		expect(calls.onReopen).toHaveBeenCalledOnce();
		expect(calls.onCancel).toHaveBeenCalledOnce();
	});

	it("shows the account once signed in, with the account page and Sign out of this Mac", () => {
		const { host, calls } = foot({
			state: "signed-in",
			email: "ada@tidemark.app",
			accountUrl: "https://spool.page/account",
		});
		const chip = host.querySelector<HTMLButtonElement>('[aria-label="Signed in as ada@tidemark.app"]');
		act(() => chip?.click());
		expect(host.querySelector<HTMLAnchorElement>('a[href="https://spool.page/account"]')?.textContent).toContain(
			"Account",
		);
		act(() => button(host, "Sign out of this Mac").click());
		expect(calls.onSignOut).toHaveBeenCalledOnce();
	});

	it("keeps quiet when spool.page cannot be reached", () => {
		const { host } = foot({ state: "unreachable" });
		expect(host.querySelector(".pj-account")).toBeNull();
		expect(host.textContent).not.toContain("Sign in");
	});
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

it("starts one untitled project at once from Home or the tab strip, saying a refusal", {
	timeout: 15_000,
}, async () => {
	vi.resetModules();
	const writes: string[] = [];
	const starts: ((response: Response) => void)[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
			if (init?.method === "POST" || init?.method === "PUT") writes.push(`${init.method} ${path}`);
			if (path.endsWith("/events"))
				return new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
					headers: { "content-type": "text/event-stream" },
				});
			if (path === "/api/projects/start") return new Promise<Response>((resolve) => starts.push(resolve));
			if (path === "/api/projects") return Response.json({ projects: [] });
			if (path === "/api/session") return Response.json({ open: [] });
			if (path === "/api/settings") return Response.json({ project: null, entries: [] });
			if (path === "/api/p/untitled/frames")
				return Response.json({ root: "/Users/test/spool/untitled", pages: [], frames: [] });
			return new Response(null, { status: 404 });
		}),
	);
	const { App } = await import("./app");
	const host = mount(createElement(App));
	await act(async () => {});
	act(() => host.querySelector<HTMLButtonElement>(".pj-welcome button")?.click());
	expect(host.querySelector("dialog")).toBeNull();
	await act(async () => starts[0]?.(Response.json({ error: "Choose a writable folder." }, { status: 409 })));
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Choose a writable folder.");

	// pressed twice while the first is on its way, it makes one project
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="New project"]')?.click());
	act(() => host.querySelector<HTMLButtonElement>('[aria-label="New project"]')?.click());
	expect(writes).toEqual(["POST /api/projects/start", "POST /api/projects/start"]);
	await act(async () => starts[1]?.(Response.json({ root: "/Users/test/spool/untitled", name: "untitled" })));
	expect(writes).toContain("PUT /api/session");
	expect(window.location.pathname).toBe("/p/untitled");
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
	expect(button(host, "Move to Trash").classList.contains("bg-danger")).toBe(true);
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
	// its tab is closing: still shrinking in the row, but no longer a tab
	expect(host.querySelector(`[data-tab-slot="${coffee.root}"]`)).toBeNull();
});

describe("Search and Recent, once this account is in a team", () => {
	const own = project("kaffe", "2026-09-03T00:00:00Z");
	const site = {
		...project("tidemark-site", "2026-09-04T00:00:00Z"),
		team: { url: "https://spool.page/tidemark/site", team: "tidemark", project: "site" },
	};
	const pitch = {
		team: "tidemark",
		project: {
			name: "pitch",
			url: "https://spool.page/tidemark/pitch",
			repo: null,
			clone: null,
			copies: [],
			checkouts: [],
			home: "~/spool/tidemark/pitch",
		},
	};
	const everywhere = (change: Partial<Everywhere> = {}): Everywhere => ({
		recent: true,
		onRecent: vi.fn(),
		query: "",
		onQuery: vi.fn(),
		onOwn: vi.fn(),
		projects: [own, site],
		teams: [{ address: "tidemark", name: "Tidemark" }],
		away: [pitch],
		drawAway: (found) =>
			found.map((each) => createElement("p", { key: each.project.name }, `away ${each.project.name}`)),
		...change,
	});
	const names = (host: HTMLElement) =>
		Array.from(host.querySelectorAll("[aria-label^='Open ']")).map((node) => node.getAttribute("aria-label"));

	it("opens on Recent: every project on this Mac, a team's included, newest opened first", () => {
		const host = mount(createElement(Home, { projects: [own], ...actions(), everywhere: everywhere() }));
		expect(host.querySelector("main h1")?.textContent).toBe("Recent");
		expect(names(host)).toEqual(["Open tidemark-site", "Open kaffe"]);
		expect(host.querySelector("nav [aria-current='page']")).toBeNull();
		expect(host.querySelector('.pj-find [aria-current="page"]')?.textContent).toBe("Recent");
	});

	it("searches from the sidebar, the page having no search of its own", () => {
		const onQuery = vi.fn();
		const host = mount(
			createElement(Home, { projects: [own], ...actions(), everywhere: everywhere({ recent: false, onQuery }) }),
		);
		expect(host.querySelector("main h1")?.textContent).toBe("Your projects");
		expect(host.querySelectorAll('input[type="search"]')).toHaveLength(1);
		act(() => type(host.querySelector('.pj-find input[type="search"]'), "site"));
		expect(onQuery).toHaveBeenCalledWith("site");
	});

	it("finds in every place, the projects not on this Mac among the covers, and narrows to one place", () => {
		const host = mount(
			createElement(Home, { projects: [own], ...actions(), everywhere: everywhere({ query: "t" }) }),
		);
		expect(host.querySelector("main h1")?.textContent).toBe("Search");
		const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
		expect(tabs.map((tab) => tab.textContent)).toEqual(["All 3", "Your projects 1", "Tidemark 2"]);
		expect(names(host)).toEqual(["Open tidemark-site", "Open kaffe"]);
		expect(host.querySelector(".pj-covers-grid")?.textContent).toContain("away pitch");
		act(() => (tabs[2] as HTMLElement).click());
		expect(names(host)).toEqual(["Open tidemark-site"]);
		expect(host.textContent).toContain("away pitch");
	});

	it("says when nothing in any place matches", () => {
		const onQuery = vi.fn();
		const host = mount(
			createElement(Home, { projects: [own], ...actions(), everywhere: everywhere({ query: "zzz", onQuery }) }),
		);
		expect(host.textContent).toContain("Nothing matches “zzz”");
		act(() =>
			Array.from(host.querySelectorAll("button"))
				.find((button) => button.textContent === "Clear search")
				?.click(),
		);
		expect(onQuery).toHaveBeenCalledWith("");
	});

	it("goes to Your projects from the nav under the switcher", () => {
		const onOwn = vi.fn();
		const host = mount(createElement(Home, { projects: [own], ...actions(), everywhere: everywhere({ onOwn }) }));
		act(() => (host.querySelector('nav[aria-label="Home sections"] button') as HTMLButtonElement).click());
		expect(onOwn).toHaveBeenCalledOnce();
	});
});
