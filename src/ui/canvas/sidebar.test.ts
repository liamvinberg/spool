// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import type { HistoryEntry } from "./history";
import { CanvasSidebar, type FrameSpan, type RailEntry, type RunEntry } from "./sidebar";

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
	/** Two controls, two jobs: the name goes into a page, the chevron unfolds it. */
	it("switches page without unfolding it, and unfolds from the chevron without going anywhere", async () => {
		const onSwitchPage = vi.fn();
		const onSelectFrame = vi.fn();
		const onDoubleClickFrame = vi.fn();
		const { host } = await render({ onSwitchPage, onSelectFrame, onDoubleClickFrame });

		expect(host.textContent).toContain("Pages1");
		expect(host.textContent).toContain("folder switches page");
		// the root page has no row, so its own frame is already on the list
		expect(host.querySelector('button[aria-label="home frame"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();

		// the name switches the canvas to the page and leaves the tree exactly as it
		// was: a press that reshapes the list is a press you cannot aim the next one after
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();

		// the chevron is the other direction, and it goes nowhere
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		expect(host.querySelector('button[aria-label="checkout frame"]')).not.toBeNull();
		expect(onSwitchPage).toHaveBeenCalledTimes(1);

		// and the name of an open page still only ever switches: it never folds it
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')).not.toBeNull();

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true, ...ACCEL }));
		});
		// the range the modifiers ask for is the rail's to answer, so a click hands
		// the canvas the question rather than a list
		expect(onSelectFrame).toHaveBeenCalledWith("checkout", { shift: true, toggle: true }, expect.any(Function));

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		expect(onDoubleClickFrame).toHaveBeenCalledWith("checkout");
	});

	it("collapses to a bare strip: the rail is the navigator, so a shut one lists nothing", async () => {
		const { host } = await render();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Collapse pages"]')?.click();
		});
		expect(host.querySelector('button[aria-label="Expand pages"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="shop page"]')).toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand pages"]')?.click();
		});
		expect(host.querySelector('button[aria-label="shop page"]')).not.toBeNull();
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
		const tree = host.querySelector('[aria-label="Pages tree"]');
		const listed = [
			...(tree?.querySelectorAll('button[aria-label$=" frame"], button[aria-label$=" page"]') ?? []),
		].map((node) => node.getAttribute("aria-label"));
		// the stored root list wins over the projection's alphabetical order, and
		// the page the file never mentioned takes its alphabetical spot rather than
		// piling up at the bottom of a list somebody arranged
		expect(listed).toEqual(["shell frame", "home frame", "admin page", "shop page"]);
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
		await dragRow(host, 'button[aria-label="checkout frame"]', 76, 44);
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

/**
 * A drag across the tree looks into the folders it rests on and leaves the ones
 * it merely crosses alone: a shut page springs open after the dwell, and shuts
 * again behind the drag unless the drop landed inside. Opening on arrival
 * instead unfolded every folder on the way to the one being aimed at.
 */
describe("a drag through the tree", () => {
	it("leaves a page it crosses shut, springs one it rests on, and closes it behind itself", async () => {
		const { host } = await render();
		await liftRow(host, 'button[aria-label="home frame"]', 20, 20);

		// the middle band of the shop row, which is how a frame changes page
		await dragTo(52, 20);
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();

		await rest();
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();

		// out again, and dropped on the root page's own list
		await dragTo(6, 20);
		await letGo(6, 20);
		expect(host.querySelector('button[aria-label="Expand shop"]')).not.toBeNull();
		expect(asked.some((call) => call.url.endsWith("/frames/move"))).toBe(false);
	});

	it("keeps the page open when that is where the drop landed", async () => {
		const { host } = await render();
		await liftRow(host, 'button[aria-label="home frame"]', 20, 21);
		await dragTo(52, 21);
		await letGo(52, 21);

		expect(asked.find((call) => call.url.endsWith("/frames/move"))?.body).toEqual({ frames: ["home"], page: "shop" });
		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
	});

	it("never shuts a page somebody had open already", async () => {
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		await liftRow(host, 'button[aria-label="home frame"]', 20, 22);
		await dragTo(52, 22);
		await rest();
		await dragTo(6, 22);
		await letGo(6, 22);

		expect(host.querySelector('button[aria-label="Collapse shop"]')).not.toBeNull();
	});

	/** The dwell is a wait being watched, so it says so on the page it is counting for. */
	it("draws the dwell on the page the drag is resting on, and takes it away when it leaves", async () => {
		const { host } = await render();
		await liftRow(host, 'button[aria-label="home frame"]', 20, 23);

		await dragTo(52, 23);
		expect(host.querySelector(".animate-spring-load")).not.toBeNull();

		await dragTo(6, 23);
		expect(host.querySelector(".animate-spring-load")).toBeNull();
		await letGo(6, 23);
	});
});

describe("renaming in place", () => {
	it("opens on the selected row, commits on blur, and keeps the frame where it was", async () => {
		const onRefresh = vi.fn();
		const { host } = await render({ onRefresh });
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

	/** The disk moved under the projection: only the daemon could have known. */
	it("stays in the input with a mono reason when the daemon refuses the name", async () => {
		stubDaemon({ "/frames/rename": { status: 409 } });
		const { host } = await render();
		await beginRenameOf(host, "home frame", 5);
		const input = host.querySelector<HTMLInputElement>('input[aria-label="Rename"]');
		await act(async () => type(input, "landing"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(asked.some((call) => call.url.endsWith("/frames/rename"))).toBe(true);
		expect(host.querySelector('input[aria-label="Rename"]')).not.toBeNull();
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("name taken");
		expect(host.querySelector('input[aria-label="Rename"]')?.getAttribute("aria-invalid")).toBe("true");
	});

	/**
	 * The rail is drawing every frame and every page, so a name it can see is
	 * taken is refused where it was typed. The wording is the daemon's own,
	 * because it is the same refusal, said sooner.
	 */
	it("refuses a name the project already holds without asking the daemon", async () => {
		const { host } = await render();
		await beginRenameOf(host, "home frame", 11);
		const input = host.querySelector<HTMLInputElement>('input[aria-label="Rename"]');
		// checkout is a frame on another page, and shop is a page's own name
		await act(async () => type(input, "checkout"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("name taken");
		expect(asked.some((call) => call.url.endsWith("/frames/rename"))).toBe(false);

		await act(async () => type(host.querySelector<HTMLInputElement>('input[aria-label="Rename"]'), "shop"));
		await act(async () =>
			host
				.querySelector<HTMLInputElement>('input[aria-label="Rename"]')
				?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
		);
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("name taken");
		expect(asked.some((call) => call.url.endsWith("/frames/rename"))).toBe(false);
	});

	it("refuses a new page named after a page that exists, in the row that is naming it", async () => {
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="New page"]')?.click();
		});
		const input = host.querySelector<HTMLInputElement>('input[aria-label="New page name"]');
		await act(async () => type(input, "shop"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(host.querySelector('input[aria-label="New page name"]')).not.toBeNull();
		expect(host.querySelector('[role="alert"]')?.textContent).toBe("name taken");
		expect(asked.some((call) => call.url.endsWith("/pages/create"))).toBe(false);
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
		expect(host.textContent).toContain("Pages1");
	});
});

describe("the row menu", () => {
	it("offers the verbs of the kind it was opened on, and no New frame anywhere", async () => {
		const { host } = await render();

		const pageRow = host.querySelector<HTMLElement>('button[aria-label="shop page"]')?.parentElement;
		await act(async () => pageRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		expect(labelsOf()).toEqual(["New page", "Rename", "Duplicate", "Move to page…", "Paste", "Move to Trash"]);
		// nothing on the clipboard, and the only page in the project has nowhere to
		// move to: itself and the page it is already in are the two refusals
		expect(deadItems()).toEqual(["Move to page…", "Paste"]);

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
			"Move to page…",
			"New page with selection",
			"Reveal on canvas",
			"Open in editor",
			"Mark as viewed",
			"Move to Trash",
		]);
		// nothing in this project is unseen, and the verb is greyed rather than gone
		expect(deadItems()).toContain("Mark as viewed");

		await act(async () => press("Escape"));
		const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
		await act(async () => list?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		expect(labelsOf()).toEqual(["New page", "Paste", "Collapse all", "Mark all as viewed"]);
		expect(deadItems()).toContain("Mark all as viewed");
		expect(labelsOf().some((label) => label?.includes("frame"))).toBe(false);
	});

	/**
	 * A right-click is a gesture you have to know about. The dots are the same
	 * menu, said out loud, and every row that has one has to wear them — a frame
	 * row always did, and a page row is the row with the most verbs on it.
	 */
	it("opens a page's menu from the dots the row wears", async () => {
		const { host } = await render();

		const dots = host.querySelector<HTMLButtonElement>('button[aria-label="shop menu"]');
		expect(dots).not.toBeNull();
		await act(async () => dots?.click());
		expect(labelsOf()).toEqual(["New page", "Rename", "Duplicate", "Move to page…", "Paste", "Move to Trash"]);
	});

	/**
	 * The same move a drag runs, with the destination typed instead of travelled
	 * to. What it must never offer is a page inside the one being moved, or the
	 * page the row is already in: both are refusals the daemon would answer a
	 * round trip later.
	 */
	it("moves to a page found by typing, and never offers one the move could not land in", async () => {
		const deep = ["explorations", "explorations/chat", "application"];
		const kept: HistoryEntry[] = [];
		const { host } = await render({
			pages: deep,
			frames: [{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 }],
			onRecord: (e) => kept.push(e),
		});

		const pageRow = host.querySelector<HTMLElement>('button[aria-label="explorations page"]')?.parentElement;
		await act(async () => pageRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		await act(async () => itemNamed("Move to page…")?.click());

		// itself, its own page and the page it already sits in are all off the list
		expect(pickable()).toEqual(["application"]);

		const field = document.body.querySelector<HTMLInputElement>('input[aria-label="Move to page"]');
		await act(async () => type(field, "app"));
		await act(async () => field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

		expect(document.body.querySelector('[aria-label="Move to page"]')).toBeNull();
		expect(asked.find((call) => call.url.endsWith("/pages/move"))?.body).toEqual({
			pages: ["explorations"],
			page: "application",
		});
		// the same entry a dragged move records, so one press takes it back
		expect(kept).toEqual([
			{
				kind: "move-page",
				pages: [{ name: "explorations", from: "" }],
				to: "application",
				lists: [
					{ of: "pages", page: "", before: ["application", "explorations"], after: ["application"] },
					{ of: "pages", page: "application", before: [], after: ["explorations"] },
				],
			},
		]);
	});

	/**
	 * The escape hatch beside reading (seen.ts). Marks clear by being looked at,
	 * which stays the rule; this is the way to say so about frames you already
	 * know about without travelling to each one. It acts on the selection like
	 * every frame verb above it, and it names only what actually wears a mark —
	 * a frame that is already seen is not news the daemon needs told twice.
	 */
	it("marks the chosen frames viewed, and never names one that is already seen", async () => {
		const onMarkSeen = vi.fn();
		const { host } = await render({
			selected: ["home", "checkout"],
			unseen: new Map([["checkout", "new" as const]]),
			onMarkSeen,
		});

		const frameRow = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		expect(deadItems()).not.toContain("Mark as viewed");
		await act(async () => itemNamed("Mark as viewed")?.click());
		// home is in the selection and has no mark: the batch is the one frame that does
		expect(onMarkSeen).toHaveBeenCalledWith(["checkout"]);
	});

	it("offers nothing to mark on a selection that is wholly seen", async () => {
		const { host } = await render({ selected: ["home"], unseen: new Map([["checkout", "changed" as const]]) });
		const frameRow = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		expect(deadItems()).toContain("Mark as viewed");
	});

	/**
	 * The bulk half: an agent writes into the canvas while nobody is there, and
	 * the way out is one press rather than one visit per frame. It reaches frames
	 * inside shut pages too — what it clears is the record, not the rows.
	 */
	it("marks the whole project viewed from the list's own empty space", async () => {
		const onMarkSeen = vi.fn();
		const { host } = await render({
			unseen: new Map([
				["home", "new" as const],
				["checkout", "changed" as const],
			]),
			onMarkSeen,
		});

		const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
		await act(async () => list?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
		expect(deadItems()).not.toContain("Mark all as viewed");
		await act(async () => itemNamed("Mark all as viewed")?.click());
		expect(onMarkSeen).toHaveBeenCalledWith(["home", "checkout"]);
	});

	it("reveals and opens the frame it was opened on", async () => {
		const onRevealFrame = vi.fn();
		const onOpenEditor = vi.fn();
		const { host } = await render({ onRevealFrame, onOpenEditor });
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
		const onSwitchPage = vi.fn();
		const { host } = await render({ onTrashFrames, onSelectFrame, onSwitchPage, selected: ["home"] });

		// nothing focused in the rail: the press belongs to the canvas below it
		await act(async () => press("Backspace"));
		expect(onTrashFrames).not.toHaveBeenCalled();

		focusList(host);
		await act(async () => press("Backspace"));
		expect(onTrashFrames).toHaveBeenCalledWith(["home"]);

		// the first row is a frame on the root page, so the first press lands on it
		await act(async () => press("ArrowDown"));
		expect(onSelectFrame).toHaveBeenCalledWith("home", { shift: false, toggle: false });
		// and the next is the shop folder: travel goes into it, which is a page it
		// arrives on rather than a frame it picks. It unfolds nothing — → is the
		// keyboard's chevron, and it is the only thing that opens a folder
		await act(async () => press("ArrowDown"));
		expect(onSelectFrame).toHaveBeenCalledTimes(1);
		expect(onSwitchPage).toHaveBeenCalledWith("shop");
		expect(host.querySelector('button[aria-label="checkout frame"]')).toBeNull();

		await act(async () => press("ArrowRight"));
		expect(host.querySelector('button[aria-label="checkout frame"]')).not.toBeNull();
	});

	/**
	 * A navigation key must never edit the layout. Unclaimed, ⇧↓ falls past the
	 * rail to the canvas and nudges the selection ten pixels, so the rail claims
	 * it and answers with the range the rows it swept name.
	 */
	it("stretches the selection on ⇧ travel instead of nudging the frames", async () => {
		const spans: FrameSpan[] = [];
		const { host } = await render({
			pages: [],
			frames: [
				{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
				{ name: "shell", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
			],
			onExtendSelection: (span: FrameSpan) => spans.push(span),
		});
		const nudgeFar = vi.fn();
		detachers.push(attachHotkeyLayer({ scope: "canvas", handlers: { "canvas.nudge-far": nudgeFar } }));

		focusList(host);
		await act(async () => press("ArrowDown"));
		await act(async () => press("ArrowDown", { shiftKey: true }));

		expect(nudgeFar).not.toHaveBeenCalled();
		expect(spans.at(-1)?.("home")).toEqual(["home", "shell"]);
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

		await dragRow(host, 'button[aria-label="checkout frame"]', 76, 44);
		expect(framesListed(host)).toEqual(["checkout frame", "cart frame"]);
		expect(kept).toEqual([
			{
				kind: "reorder",
				lists: [{ of: "frames", page: "shop", before: ["cart", "checkout"], after: ["checkout", "cart"] }],
			},
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

		// out of the loose block and onto the middle band of the shop row, which is
		// how a frame changes page
		await dragRow(host, 'button[aria-label="home frame"]', 20, 52);
		expect(asked.find((call) => call.url.endsWith("/frames/move"))?.body).toEqual({ frames: ["home"], page: "shop" });
		expect(kept).toEqual([
			{
				kind: "move",
				frames: [{ name: "home", from: "" }],
				to: "shop",
				lists: [
					{ of: "frames", page: "", before: ["home"], after: [] },
					{ of: "frames", page: "shop", before: ["checkout"], after: ["checkout", "home"] },
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

	/**
	 * Finder's New Folder with Selection, in spool's vocabulary. One gesture, so
	 * one entry: two would take two presses, and the press in between would leave
	 * a page nobody asked for holding frames that were already back where they
	 * started.
	 */
	it("records a page made with the selection as one entry, frames and all", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ selected: ["home"], onRecord: (e) => kept.push(e), run });

		const frameRow = host.querySelector<HTMLElement>('button[aria-label="home frame"]')?.parentElement;
		await act(async () =>
			frameRow?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
		);
		await act(async () => itemNamed("New page with selection")?.click());
		const input = host.querySelector<HTMLInputElement>('input[aria-label="New page name"]');
		await act(async () => type(input, "loose"));
		await act(async () => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		expect(asked.find((call) => call.url.endsWith("/pages/create"))?.body).toEqual({ name: "loose" });
		expect(asked.find((call) => call.url.endsWith("/frames/move"))?.body).toEqual({
			frames: ["home"],
			page: "loose",
		});
		expect(kept).toEqual([
			{
				kind: "gather",
				page: "loose",
				frames: [{ name: "home", from: "" }],
				lists: [
					{ of: "frames", page: "", before: ["home"], after: [] },
					{ of: "frames", page: "loose", before: [], after: ["home"] },
				],
			},
		]);

		// the rail's half of the way back is the frames leaving; the page itself is
		// the toast's, which is the canvas's half of the same press
		await act(async () => {
			await run.current?.(railEntry(kept[0]), "undo");
		});
		expect(asked.filter((call) => call.url.endsWith("/frames/move")).at(-1)?.body).toEqual({
			frames: ["home"],
			page: "",
		});
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
 * Depth (#231). A page holds pages, so a row's indent is a fact about its own
 * path, a drag over a page row nests what it is carrying, and a page can never
 * be dropped inside itself.
 */
describe("pages inside pages", () => {
	const deepPages = ["explorations", "explorations/chat", "application"];
	const deepFrames = [
		{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
		{ name: "agent-chat", page: "explorations/chat", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
	];

	it("draws a page inside a page by its own name, one step further in", async () => {
		const { host } = await render({ pages: deepPages, frames: deepFrames });

		// a shut page keeps its own pages off the list, exactly as it does its frames
		expect(pagesListed(host)).toEqual(["application page", "explorations page"]);

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand explorations"]')?.click();
		});

		expect(pagesListed(host)).toEqual(["application page", "explorations page", "chat page"]);
		const nested = host.querySelector<HTMLElement>('button[aria-label="chat page"]')?.parentElement;
		const top = host.querySelector<HTMLElement>('button[aria-label="explorations page"]')?.parentElement;
		expect(nested?.getAttribute("aria-level")).toBe("2");
		expect(top?.getAttribute("aria-level")).toBe("1");
		expect(nested?.style.paddingLeft).toBe("10px");
		expect(top?.style.paddingLeft).toBe("0px");
	});

	/**
	 * Reach is what tells the two verbs apart: a control on one row may act on
	 * that row's folder and everything in it, and the whole tree is the header's
	 * to fold — which is also the only place it can be reached from once the tree
	 * is open enough to leave no empty space to right-click.
	 */
	it("folds one page's subtree from ⌥ on its chevron, and the whole tree from the header", async () => {
		const { host } = await render({ pages: deepPages, frames: deepFrames });
		expect(host.querySelector<HTMLButtonElement>('button[aria-label="Collapse all"]')?.disabled).toBe(true);

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="Expand explorations"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
		});
		expect(host.querySelector('button[aria-label="Collapse explorations"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="Collapse chat"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="Expand application"]')).not.toBeNull();

		const foldAll = host.querySelector<HTMLButtonElement>('button[aria-label="Collapse all"]');
		expect(foldAll?.disabled).toBe(false);
		await act(async () => foldAll?.click());
		expect(pagesListed(host)).toEqual(["application page", "explorations page"]);
	});

	it("moves a page into another one, and puts it back where it came from", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ pages: deepPages, frames: deepFrames, onRecord: (e) => kept.push(e), run });

		// onto the middle band of the application row, which is how a page nests
		await dragRow(host, 'button[aria-label="explorations page"]', 84, 52);

		expect(asked.find((call) => call.url.endsWith("/pages/move"))?.body).toEqual({
			pages: ["explorations"],
			page: "application",
		});
		expect(kept).toEqual([
			{
				kind: "move-page",
				pages: [{ name: "explorations", from: "" }],
				to: "application",
				lists: [
					{ of: "pages", page: "", before: ["application", "explorations"], after: ["application"] },
					{ of: "pages", page: "application", before: [], after: ["explorations"] },
				],
			},
		]);

		const entry = kept[0];
		if (entry?.kind !== "move-page") throw new Error("the drag recorded no page move");
		await act(async () => {
			await run.current?.(entry, "undo");
		});
		// the page is named by the path the move left it at, and goes back to the root page
		expect(asked.filter((call) => call.url.endsWith("/pages/move")).at(-1)?.body).toEqual({
			pages: ["application/explorations"],
			page: "",
		});
	});

	it("never offers a page a drop inside itself", async () => {
		const { host } = await render({ pages: deepPages, frames: deepFrames });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand explorations"]')?.click();
		});

		// onto the middle band of its own page inside it, which is no landing at all
		await dragRow(host, 'button[aria-label="explorations page"]', 84, 116);

		expect(asked.some((call) => call.url.endsWith("/pages/move"))).toBe(false);
	});
});

/**
 * The list is the root (#232). The root page is the frames directory itself
 * rather than a folder in it, so it has no row: its frames are loose rows at
 * the top level, answering every verb the rows beside them answer.
 */
describe("the root page has no row", () => {
	const loose = [
		{ name: "home", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
		{ name: "shell", kind: "html" as const, x: 0, y: 0, w: 390, h: 844 },
	];

	it("draws a flat project as its frames alone, with no folder ceremony around them", async () => {
		const { host } = await render({ pages: [], frames: loose });

		expect(framesListed(host)).toEqual(["home frame", "shell frame"]);
		expect(pagesListed(host)).toEqual([]);
		expect(host.querySelector('[aria-label="Pages tree"] button[aria-label^="Expand "]')).toBeNull();
		// no pages to count, so the header says Pages and stops
		expect(host.querySelector("h1")?.parentElement?.textContent).toBe("Pages");

		// a loose frame is a treeitem at the top level, and there is no page row
		// above it for a spine to hang off
		const row = rowOf(host, "home frame");
		expect(row?.getAttribute("aria-level")).toBe("1");
		expect(row?.querySelectorAll(".bg-border-raised").length).toBe(0);
	});

	it("keeps a frame inside a page one level in, on the spine of the row holding it", async () => {
		const { host } = await render();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		const row = rowOf(host, "checkout frame");
		expect(row?.getAttribute("aria-level")).toBe("2");
		expect(row?.querySelectorAll(".bg-border-raised").length).toBe(2);
	});

	it("lights no page row while the root page is the one on the canvas", async () => {
		const { host, rerender } = await render();
		expect(host.querySelector('[aria-current="page"]')).toBeNull();

		await rerender({ activePage: "shop" });
		expect(host.querySelector('button[aria-label="shop page"]')?.getAttribute("aria-current")).toBe("page");
	});

	it("reorders the root page's own frames, and states that list on the way back", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ pages: [], frames: loose, onRecord: (e) => kept.push(e), run });

		// shell above home, which is the gap over the first row: nothing stands
		// there any more, so it is a place a drop can mean
		await dragRow(host, 'button[aria-label="shell frame"]', 50, 6);
		expect(framesListed(host)).toEqual(["shell frame", "home frame"]);
		expect(lastOrder()?.frames?.[""]).toEqual(["shell", "home"]);
		expect(kept).toEqual([
			{
				kind: "reorder",
				lists: [{ of: "frames", page: "", before: ["home", "shell"], after: ["shell", "home"] }],
			},
		]);

		await act(async () => {
			await run.current?.(railEntry(kept[0]), "undo");
		});
		expect(lastOrder()?.frames?.[""]).toEqual(["home", "shell"]);
		expect(framesListed(host)).toEqual(["home frame", "shell frame"]);
	});

	it("moves a frame out of a page and onto the root page, and puts it back", async () => {
		const kept: HistoryEntry[] = [];
		const run: { current: RunEntry | null } = { current: null };
		const { host } = await render({ onRecord: (e) => kept.push(e), run });
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});

		// out of shop and into the top-level block, under the frame already there
		await dragRow(host, 'button[aria-label="checkout frame"]', 76, 28);
		expect(asked.find((call) => call.url.endsWith("/frames/move"))?.body).toEqual({
			frames: ["checkout"],
			page: "",
		});
		expect(kept).toEqual([
			{
				kind: "move",
				frames: [{ name: "checkout", from: "shop" }],
				to: "",
				lists: [
					{ of: "frames", page: "shop", before: ["checkout"], after: [] },
					{ of: "frames", page: "", before: ["home"], after: ["home", "checkout"] },
				],
			},
		]);

		await act(async () => {
			await run.current?.(railEntry(kept[0]), "undo");
		});
		expect(asked.filter((call) => call.url.endsWith("/frames/move")).at(-1)?.body).toEqual({
			frames: ["checkout"],
			page: "shop",
		});
	});
});

/**
 * Drag one row to a pointer y and let go.
 *
 * Rows are placed by arithmetic rather than measured, so a client y maps onto a
 * gap even here, where every box reads as zero.
 */
async function dragRow(host: HTMLElement, selector: string, fromY: number, toY: number, pointerId = 8) {
	await liftRow(host, selector, fromY, pointerId);
	await dragTo(toY, pointerId);
	await letGo(toY, pointerId);
}

/** Press a row and travel far enough that the press became a drag. */
async function liftRow(host: HTMLElement, selector: string, fromY: number, pointerId: number) {
	// every box reads as zero here, which would put the pointer inside the list's
	// bottom auto-scroll band for the whole drag and drift the drop; give the
	// list the height it has on screen
	const list = host.querySelector<HTMLElement>('[aria-label="Pages tree"]');
	if (list !== null) {
		list.getBoundingClientRect = () =>
			({ top: 0, bottom: 800, left: 0, right: 248, width: 248, height: 800, x: 0, y: 0 }) as DOMRect;
		// these lists are shorter than the box they sit in, so there is nothing to
		// scroll: happy-dom takes a negative scrollTop where a browser clamps at
		// zero, and without this the drag's edge band pulls the list above its own
		// start and every drop near the top drifts
		Object.defineProperty(list, "scrollTop", { configurable: true, get: () => 0, set: () => {} });
	}
	const row = host.querySelector<HTMLElement>(selector)?.parentElement;
	await act(async () => {
		row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId, clientY: fromY }));
		window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId, clientY: fromY - 10 }));
	});
}

/**
 * Carry the drag to a y and let it be read there. The wait is the drag loop's
 * own animation frame: where the pointer is is resolved there, so arriving
 * before one has run is a drag that was never anywhere.
 */
async function dragTo(y: number, pointerId: number) {
	await act(async () => {
		window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId, clientY: y }));
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 40));
	});
}

/**
 * Hold the drag where it is for longer than the spring-load dwell, so a shut
 * page under it has been rested on rather than crossed.
 */
async function rest() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 520));
	});
}

async function letGo(y: number, pointerId: number) {
	await act(async () => {
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId, clientY: y }));
	});
}

/** the frame rows on screen, in the order the rail is drawing them */
function framesListed(host: HTMLElement): Array<string | null> {
	const tree = host.querySelector('[aria-label="Pages tree"]');
	return [...(tree?.querySelectorAll('button[aria-label$=" frame"]') ?? [])].map((node) =>
		node.getAttribute("aria-label"),
	);
}

/** every page row on screen, by the name it draws, in list order */
function pagesListed(host: HTMLElement): Array<string | null> {
	const tree = host.querySelector('[aria-label="Pages tree"]');
	return [...(tree?.querySelectorAll('button[aria-label$=" page"]') ?? [])].map((node) =>
		node.getAttribute("aria-label"),
	);
}

/** the treeitem a row's own control sits in, which is what carries its place in the tree */
function rowOf(host: HTMLElement, label: string): HTMLElement | null | undefined {
	return host.querySelector<HTMLElement>(`button[aria-label="${label}"]`)?.parentElement;
}

/** What was recorded, as the rail's own runner takes it — and an assertion in itself. */
function railEntry(entry: HistoryEntry | undefined): RailEntry {
	if (entry === undefined || entry.kind === "geometry" || entry.kind === "mint" || entry.kind === "patch") {
		throw new Error(`not an entry this rail runs: ${entry?.kind ?? "nothing recorded"}`);
	}
	return entry;
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

/** the menu rows the list offers and refuses in the same breath */
function deadItems(): Array<string | null | undefined> {
	return [...document.body.querySelectorAll('[role="menuitem"]')]
		.filter((item) => item.hasAttribute("disabled"))
		.map((item) => item.querySelector("span")?.textContent);
}

/** Put the cursor on a row and open its rename field, the way F2 does. */
async function beginRenameOf(host: HTMLElement, label: string, pointerId: number) {
	const row = host.querySelector<HTMLElement>(`button[aria-label="${label}"]`)?.parentElement;
	await act(async () => {
		row?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId }));
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId }));
	});
	focusList(host);
	await act(async () => press("F2"));
}

/** the pages the move picker is offering, in the order it lists them */
function pickable(): Array<string | null> {
	return [...document.body.querySelectorAll('[aria-label="Move to page"] button[data-at]')].map(
		(row) => row.querySelector("span")?.textContent ?? null,
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
		onExtendSelection: vi.fn(),
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
