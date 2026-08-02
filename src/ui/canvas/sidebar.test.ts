// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import type { HistoryEntry } from "./history";
import { CanvasSidebar, type RailEntry, type RunEntry } from "./sidebar";

/** The toggle modifier as this environment binds it — ctrl under happy-dom, ⌘ on a Mac. */
const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [
	{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
	{ name: "checkout", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
];

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];
/** hotkey layers a test stood up beside the rail's own */
const detachers: Array<() => void> = [];
/** every request the rail made, so a test can read what it asked the daemon for */
let asked: Array<{ url: string; body: unknown }> = [];

/** the daemon, answering the way it does for a project with one named page */
function stubDaemon(answers: Record<string, { status?: number; json?: unknown }> = {}) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
			const raw = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
			asked.push({ url, body: raw });
			for (const [tail, answer] of Object.entries(answers)) {
				if (!url.endsWith(tail)) continue;
				if (answer.status !== undefined && answer.status >= 400) {
					return new Response(`refused ${tail}`, { status: answer.status });
				}
				return answer.json === undefined ? new Response(null, { status: 204 }) : Response.json(answer.json);
			}
			if (url.endsWith("/order")) return Response.json({});
			return new Response(null, { status: 204 });
		}),
	);
}

/** the rail's own scope is up while the rail holds focus */
function focusList(host: HTMLElement) {
	host.querySelector<HTMLElement>('[aria-label="Pages tree"]')?.focus();
}

function press(key: string, extra: KeyboardEventInit = {}) {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}

/** React listens for `input`, so the value has to be set through the native setter */
function type(element: HTMLInputElement | null, text: string) {
	if (element === null) throw new Error("no input to type into");
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, text);
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
	asked = [];
	window.localStorage?.clear();
	stubDaemon();
});

afterEach(() => {
	for (const detach of detachers.splice(0)) detach();
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
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
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')).not.toBeNull();

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
		const grip = host.querySelector<HTMLButtonElement>('button[aria-label="Resize pages"]');
		expect(aside?.style.width).toBe("248px");

		await act(async () => {
			grip?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 248, pointerId: 1 }));
			grip?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 600, pointerId: 1 }));
			grip?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 600, pointerId: 1 }));
		});
		expect(aside?.style.width).toBe("480px");

		await act(async () => {
			grip?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 480, pointerId: 2 }));
			grip?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, pointerId: 2 }));
			grip?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 100, pointerId: 2 }));
		});
		expect(aside?.style.width).toBe("44px");
	});

	it("does not open a page activated outside the tree", async () => {
		const { host, rerender } = await render();
		await rerender({ activePage: "shop" });
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();
		expect(host.querySelector('button[aria-label="shop page"]')?.getAttribute("aria-current")).toBe("page");
	});

	it("opens the page of a frame picked from somewhere else, so the pick has a row", async () => {
		const { host, rerender } = await render();
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();

		await rerender({ activePage: "shop", selected: ["checkout"] });
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe("true");
	});
});

describe("the stored order", () => {
	it("arranges the rail by what canvas.json says, and drops names it no longer has", async () => {
		stubDaemon({ "/order": { json: { pages: ["shop"], frames: { "": ["shell", "home"] } } } });
		const { host } = await render({
			pages: ["shop", "admin"],
			frames: [...frames, { name: "shell", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 }],
		});
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		const tree = host.querySelector('[aria-label="Pages tree"]');
		const listed = [
			...(tree?.querySelectorAll('button[aria-label$=" frame"], button[aria-label$=" page"]') ?? []),
		].map((node) => node.getAttribute("aria-label"));
		// the stored root list wins over the projection's alphabetical order, and
		// the page the file never mentioned takes its alphabetical spot rather than
		// piling up at the bottom of a list somebody arranged
		expect(listed).toEqual(["root page", "shell frame", "home frame", "admin page", "shop page"]);
	});

	it("writes the order the moment a page is dropped, and never touches geometry", async () => {
		const { host } = await render({ pages: ["shop", "admin"] });
		const row = host.querySelector<HTMLElement>('button[aria-label="admin page"]')?.parentElement;
		await act(async () => {
			row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 3, clientY: 120 }));
			window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 3, clientY: 40 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientY: 40 }));
		});
		expect(asked.some((call) => call.url.endsWith("/geometry"))).toBe(false);
	});

	/**
	 * The arrangement has to outlive the undo window. A staged page still exists
	 * on disk, so its order entries are not stale and nothing here may drop them
	 * — the daemon does that when the toast drains and the move actually happens.
	 */
	it("keeps a trashed page's frame arrangement while the toast is up, so undo brings it back whole", async () => {
		const shopFrames = [
			{ name: "cart", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
			{ name: "checkout", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
		];
		const onTrashPage = vi.fn();
		const { host, rerender } = await render({ pages: ["shop"], frames: shopFrames, onTrashPage });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		expect(framesListed(host)).toEqual(["cart frame", "checkout frame"]);

		// drag checkout above cart
		await dragRow(host, 'button[aria-label="checkout frame"]', 108, 76);
		expect(framesListed(host)).toEqual(["checkout frame", "cart frame"]);
		expect(lastOrder()?.frames?.shop).toEqual(["checkout", "cart"]);

		const wrote = asked.filter((call) => call.url.endsWith("/order")).length;
		const pageRow = host.querySelector<HTMLElement>('button[aria-label="shop page"]')?.parentElement;
		await act(async () => {
			pageRow?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 9 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 9 }));
		});
		focusList(host);
		await act(async () => press("Backspace"));
		expect(onTrashPage).toHaveBeenCalledWith("shop", ["checkout", "cart"]);
		// staging says nothing about the order: the page is still on disk
		expect(asked.filter((call) => call.url.endsWith("/order")).length).toBe(wrote);

		// undo — the page comes back, and so does the arrangement
		await rerender({ pages: ["shop"], frames: shopFrames, onTrashPage });
		expect(framesListed(host)).toEqual(["checkout frame", "cart frame"]);
	});
});

describe("renaming in place", () => {
	it("opens on the selected row, commits on blur, and keeps the frame where it was", async () => {
		const onRefresh = vi.fn();
		const { host } = await render({ onRefresh });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		const row = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () => {
			row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 4 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 4 }));
		});
		focusList(host);
		await act(async () => press("Enter"));

		const input = host.querySelector<HTMLInputElement>('input[aria-label="Rename"]');
		expect(input).not.toBeNull();
		await act(async () => type(input, "landing"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		const rename = asked.find((call) => call.url.endsWith("/frames/rename"));
		expect(rename?.body).toEqual({ from: "home", to: "landing" });
		// the daemon leaves frame names in the order alone, so the rail states the move
		const order = asked.filter((call) => call.url.endsWith("/order")).at(-1);
		expect((order?.body as { frames?: Record<string, string[]> })?.frames?.[""]).toEqual(["landing"]);
		expect(onRefresh).toHaveBeenCalled();
	});

	it("stays in the input with a mono reason when the name is claimed", async () => {
		stubDaemon({ "/frames/rename": { status: 409 } });
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		const row = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () => {
			row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 5 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 5 }));
		});
		focusList(host);
		await act(async () => press("F2"));
		const input = host.querySelector<HTMLInputElement>('input[aria-label="Rename"]');
		await act(async () => type(input, "checkout"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(host.querySelector('input[aria-label="Rename"]')).not.toBeNull();
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("name taken");
		expect(host.querySelector('input[aria-label="Rename"]')?.getAttribute("aria-invalid")).toBe("true");
	});

	it("is born in rename mode from the plus, and leaves nothing behind on escape", async () => {
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="New page"]')?.click();
		});
		const input = host.querySelector<HTMLInputElement>('input[aria-label="New page name"]');
		expect(input).not.toBeNull();
		expect(input?.value).toBe("");

		await act(async () => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
		});
		expect(host.querySelector('input[aria-label="New page name"]')).toBeNull();
		expect(asked.some((call) => call.url.endsWith("/pages/create"))).toBe(false);
		expect(host.textContent).toContain("Pages2");
	});
});

describe("the row menu", () => {
	it("offers the verbs of the kind it was opened on, and no New frame anywhere", async () => {
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});

		const pageRow = host.querySelector<HTMLElement>('button[aria-label="shop page"]')?.parentElement;
		await act(async () => pageRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		expect(labelsOf()).toEqual(["New page", "Rename", "Duplicate", "Paste", "Move to Trash"]);

		await act(async () => press("Escape"));
		expect(document.body.querySelector('[role="menu"]')).toBeNull();

		const frameRow = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		expect(labelsOf()).toEqual([
			"Rename",
			"Duplicate",
			"Copy",
			"Reveal on canvas",
			"Open in editor",
			"Move to Trash",
		]);

		await act(async () => press("Escape"));
		const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
		await act(async () => list?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		expect(labelsOf()).toEqual(["New page", "Paste", "Collapse all"]);
		expect(labelsOf().some((label) => label?.includes("frame"))).toBe(false);
	});

	it("keeps the permanent root page's own verbs dead rather than missing", async () => {
		const { host } = await render();
		const rootRow = host.querySelector<HTMLElement>('button[aria-label="root page"]')?.parentElement;
		await act(async () => rootRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		const disabled = [...document.body.querySelectorAll('[role="menuitem"]')]
			.filter((item) => item.hasAttribute("disabled"))
			.map((item) => item.querySelector("span")?.textContent);
		expect(disabled).toEqual(["Rename", "Duplicate", "Paste", "Move to Trash"]);
	});

	it("reveals and opens the frame it was opened on", async () => {
		const onRevealFrame = vi.fn();
		const onOpenEditor = vi.fn();
		const { host } = await render({ onRevealFrame, onOpenEditor });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		const frameRow = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		await act(async () => itemNamed("Reveal on canvas")?.click());
		expect(onRevealFrame).toHaveBeenCalledWith("home");

		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		await act(async () => itemNamed("Open in editor")?.click());
		expect(onOpenEditor).toHaveBeenCalledWith("home");
	});
});

describe("the sidebar scope", () => {
	it("answers ⌫ and the arrows only while the rail holds focus", async () => {
		const onTrashFrames = vi.fn();
		const onSelectFrame = vi.fn();
		const { host } = await render({ onTrashFrames, onSelectFrame, selected: ["home"] });

		// nothing focused in the rail: the press belongs to the canvas below it
		await act(async () => press("Backspace"));
		expect(onTrashFrames).not.toHaveBeenCalled();

		focusList(host);
		await act(async () => press("Backspace"));
		expect(onTrashFrames).toHaveBeenCalledWith(["home"]);

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		focusList(host);
		await act(async () => press("ArrowDown"));
		expect(onSelectFrame).not.toHaveBeenCalled(); // the first row is the root page
		await act(async () => press("ArrowDown"));
		expect(onSelectFrame).toHaveBeenCalledWith("home", { shift: false, toggle: false });
	});

	it("takes a whole page to the Trash as one entry", async () => {
		const onTrashPage = vi.fn();
		const { host } = await render({ onTrashPage });
		const pageRow = host.querySelector<HTMLElement>('button[aria-label="shop page"]')?.parentElement;
		await act(async () => {
			pageRow?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 6 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 6 }));
		});
		focusList(host);
		await act(async () => press("Backspace"));
		expect(onTrashPage).toHaveBeenCalledWith("shop", ["checkout"]);
	});

	/**
	 * Precedence, not just gating: the rail sits above the canvas and is not
	 * exclusive, so it takes the keys it declares and every other press carries
	 * on down exactly as it did before this rail had any keys at all.
	 */
	it("outranks the canvas on the keys it claims and lets every other press through", async () => {
		const onTrashFrames = vi.fn();
		const { host } = await render({ onTrashFrames, selected: ["home"] });
		const canvasTrash = vi.fn();
		const canvasEscape = vi.fn();
		const detach = attachHotkeyLayer({
			scope: "canvas",
			handlers: { "canvas.trash": canvasTrash, "canvas.escape": canvasEscape },
		});
		detachers.push(detach);

		// the rail has no focus yet, so the canvas below it answers as it always has
		await act(async () => press("Backspace"));
		expect(canvasTrash).toHaveBeenCalledTimes(1);
		expect(onTrashFrames).not.toHaveBeenCalled();

		focusList(host);
		await act(async () => press("Backspace"));
		expect(onTrashFrames).toHaveBeenCalledWith(["home"]);
		expect(canvasTrash).toHaveBeenCalledTimes(1); // still the one from before

		// esc is nobody's binding in this rail, and the scope does not swallow
		await act(async () => press("Escape"));
		expect(canvasEscape).toHaveBeenCalledTimes(1);
	});

	it("walks the rows by typing a name", async () => {
		const onSelectFrame = vi.fn();
		const { host } = await render({ onSelectFrame });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
		const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
		list?.focus();
		await act(async () =>
			list?.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true })),
		);
		expect(onSelectFrame).toHaveBeenCalledWith("home", { shift: false, toggle: false });
	});

	it("copies and pastes onto the active page, and cascades what lands", async () => {
		stubDaemon({ "/frames/duplicate": { json: { frames: [{ from: "home", to: "home-copy", page: "shop" }] } } });
		const onCopiesLanded = vi.fn();
		const { host } = await render({ activePage: "shop", onCopiesLanded, selected: ["home"] });
		focusList(host);
		await act(async () => press("c", ACCEL));
		expect(host.textContent).toContain("1 copied");

		await act(async () => press("v", ACCEL));
		const paste = asked.find((call) => call.url.endsWith("/frames/duplicate"));
		expect(paste?.body).toEqual({ frames: ["home"], page: "shop" });
		expect(onCopiesLanded).toHaveBeenCalledWith([{ from: "home", to: "home-copy", page: "shop" }]);
	});
});

/**
 * The rail's half of the one undo stack (#230).
 *
 * The canvas holds the entries and decides which press they answer; what is
 * this rail's is saying what it did and being able to do it the other way
 * round. So each of these records a verb and then runs the entry back through
 * the runner the rail hands out, which is the whole seam.
 */
describe("the one undo stack", () => {
	/** What was recorded, as the rail's own runner takes it — and an assertion in itself. */
	function railEntry(entry: HistoryEntry | undefined): RailEntry {
		if (entry === undefined || entry.kind === "geometry" || entry.kind === "mint") {
			throw new Error(`not an entry this rail runs: ${entry?.kind ?? "nothing recorded"}`);
		}
		return entry;
	}

	const shopFrames = [
		{ name: "cart", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
		{ name: "checkout", page: "shop", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
	];

	it("records a reorder, and states the list it replaced again on the way back", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ pages: ["shop"], frames: shopFrames, onRecord: (e) => kept.push(e), run });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});

		await dragRow(host, 'button[aria-label="checkout frame"]', 108, 76);
		expect(framesListed(host)).toEqual(["checkout frame", "cart frame"]);
		expect(kept).toEqual([
			{ kind: "reorder", lists: [{ page: "shop", before: ["cart", "checkout"], after: ["checkout", "cart"] }] },
		]);

		await act(async () => {
			await run.current?.(railEntry(kept[0]), "undo");
		});
		expect(lastOrder()?.frames?.shop).toEqual(["cart", "checkout"]);
		expect(framesListed(host)).toEqual(["cart frame", "checkout frame"]);
	});

	it("records a move against the page each frame came from, and puts it back there", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ onRecord: (e) => kept.push(e), run });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});

		// onto the middle band of the shop row, which is how a frame changes page
		await dragRow(host, 'button[aria-label="home frame"]', 40, 84);
		expect(asked.find((call) => call.url.endsWith("/frames/move"))?.body).toEqual({ frames: ["home"], page: "shop" });
		expect(kept).toEqual([
			{
				kind: "move",
				frames: [{ name: "home", from: "" }],
				to: "shop",
				lists: [
					{ page: "", before: ["home"], after: [] },
					{ page: "shop", before: ["checkout"], after: ["checkout", "home"] },
				],
			},
		]);

		await act(async () => {
			await run.current?.(railEntry(kept[0]), "undo");
		});
		expect(asked.filter((call) => call.url.endsWith("/frames/move")).at(-1)?.body).toEqual({
			frames: ["home"],
			page: "",
		});
		expect(lastOrder()?.frames?.[""]).toEqual(["home"]);
	});

	/**
	 * A copy was nowhere a moment ago, so the only inverse is a delete, and this
	 * canvas's delete is the staged one. The entry names what the daemon minted,
	 * which is the only thing the toast could take back.
	 */
	it("records a duplicate as the copies it minted", async () => {
		stubDaemon({ "/frames/duplicate": { json: { frames: [{ from: "home", to: "home-copy" }] } } });
		const kept: HistoryEntry[] = [];
		const { host } = await render({ selected: ["home"], onRecord: (e) => kept.push(e) });
		focusList(host);
		await act(async () => press("c", ACCEL));
		await act(async () => press("v", ACCEL));
		expect(kept).toEqual([{ kind: "mint", staged: { frames: ["home-copy"], page: null } }]);
	});

	it("records a new page as a mint of the page itself", async () => {
		const kept: HistoryEntry[] = [];
		const { host } = await render({ onRecord: (e) => kept.push(e) });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="New page"]')?.click();
		});
		const input = host.querySelector<HTMLInputElement>('input[aria-label="New page name"]');
		await act(async () => type(input, "admin"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(kept).toEqual([{ kind: "mint", staged: { frames: [], page: "admin" } }]);
	});

	it("leaves the stacks alone when the daemon refuses the way back", async () => {
		stubDaemon({ "/frames/rename": { status: 409 } });
		const onRefresh = vi.fn();
		const run: { current: RunEntry | null } = { current: null };
		await render({ run, onRefresh });
		let ran: boolean | undefined;
		await act(async () => {
			ran = await run.current?.({ kind: "rename", of: "frame", from: "home", to: "landing" }, "undo");
		});
		// the name was re-claimed while the entry sat on the stack: the canvas is
		// told the run never happened, and the projection is read again
		expect(ran).toBe(false);
		expect(onRefresh).toHaveBeenCalled();
	});
});

/**
 * Drag one row to a pointer y and let go.
 *
 * Rows are placed by arithmetic rather than measured, so a client y maps onto a
 * gap even here, where every box reads as zero. The wait is the drag loop's own
 * animation frame: the landing is resolved there, so letting go before one has
 * run is a drag that never chose anywhere to land.
 */
async function dragRow(host: HTMLElement, selector: string, fromY: number, toY: number, pointerId = 8) {
	// every box reads as zero here, which would put the pointer inside the list's
	// bottom auto-scroll band for the whole drag and drift the drop; give the
	// list the height it has on screen
	const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
	if (list !== null) {
		list.getBoundingClientRect = () =>
			({ top: 0, bottom: 800, left: 0, right: 248, width: 248, height: 800, x: 0, y: 0 }) as DOMRect;
	}
	const row = host.querySelector<HTMLElement>(selector)?.parentElement;
	await act(async () => {
		row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId, clientY: fromY }));
		window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId, clientY: fromY - 10 }));
		window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId, clientY: toY }));
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 40));
	});
	await act(async () => {
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId, clientY: toY }));
	});
}

/** the frame rows on screen, in the order the rail is drawing them */
function framesListed(host: HTMLElement): Array<string | null> {
	const tree = host.querySelector('[aria-label="Pages tree"]');
	return [...(tree?.querySelectorAll('button[aria-label$=" frame"]') ?? [])].map((node) =>
		node.getAttribute("aria-label"),
	);
}

/** the last order the rail put on the wire */
function lastOrder(): { pages?: string[]; frames?: Record<string, string[]> } | undefined {
	return asked.filter((call) => call.url.endsWith("/order")).at(-1)?.body as
		| { pages?: string[]; frames?: Record<string, string[]> }
		| undefined;
}

/** a menu row's own words; the key face beside them is a second span */
function labelsOf(scope: ParentNode = document.body): Array<string | null> {
	return [...scope.querySelectorAll('[role="menuitem"]')].map(
		(item) => item.querySelector("span")?.textContent ?? null,
	);
}

function itemNamed(label: string): HTMLButtonElement | undefined {
	return [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
		(item) => item.querySelector("span")?.textContent === label,
	);
}

async function render(overrides: Partial<React.ComponentProps<typeof CanvasSidebar>> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted.push({ root, host });
	const props: React.ComponentProps<typeof CanvasSidebar> = {
		project: "test",
		pages: ["shop"],
		activePage: "",
		frames,
		selected: [],
		onSwitchPage: vi.fn(),
		onSelectFrame: vi.fn(),
		onDoubleClickFrame: vi.fn(),
		onTrashFrames: vi.fn(),
		onTrashPage: vi.fn(),
		onRevealFrame: vi.fn(),
		onOpenEditor: vi.fn(),
		onCopiesLanded: vi.fn(),
		onRefresh: vi.fn(),
		...overrides,
	};
	const rerender = async (next: Partial<React.ComponentProps<typeof CanvasSidebar>> = {}) => {
		await act(async () => {
			root.render(createElement(CanvasSidebar, { ...props, ...next }));
		});
	};
	await rerender();
	return { host, rerender };
}
