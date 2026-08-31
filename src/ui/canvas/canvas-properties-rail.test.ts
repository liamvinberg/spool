// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";
import type { PickedHit } from "./protocol";

/**
 * The properties rail out on the canvas (#256): the right column, holding one
 * thing.
 *
 * What is proved here is the shell — which rail the column stands in, what the
 * crumbs say and where a press on one lands, what a scope chip does, and what
 * each empty state reads. The rows between them are #257's and #258's, and the
 * scope vocabulary itself is `properties-scope.test.ts`'s.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [
	{ name: "home", x: 0, y: 0, w: 640, h: 480, kind: "html" },
	{ name: "receipt", x: 900, y: 0, w: 390, h: 640, kind: "html" },
];

/** An ancestry the shim would answer with, root element first, every rung stamped. */
const ancestry = (...selectors: readonly string[]): PickedHit[] =>
	selectors.map((selector, depth) => ({
		selector,
		tag: depth === 0 ? "div" : "span",
		outerHtml: `<div class="${selector}" />`,
		rect: { x: depth * 4, y: depth * 4, w: 100 - depth * 8, h: 80 - depth * 8 },
		radius: 0,
		source: `frames/home/frame.tsx:${10 + depth}:3`,
		generated: false,
	}));

/** screen › footer › pay, the ancestry under the pointer in every test here. */
const CHAIN = ancestry("screen", "footer", "pay");

/** eight rungs, which is deeper than any rail can draw whole (#263) */
const DEEP = ancestry("main", "header", "nav", "list", "item", "row", "label", "pay");

/** the same ancestry with an image at its foot, which is what a swap is offered on */
const IMG_CHAIN = CHAIN.map((hit, at) => (at === 2 ? { ...hit, tag: "img" } : hit));

/** the same rung with a className no hand may write, which is what a refusal reads off */
const asExpression = (rung: (typeof RUNGS)[number]) => ({
	...rung,
	refusal: { code: "computed-class", says: "className is an expression", expression: "{busy ? a : b}" },
});

/** what the daemon says the file holds for that ancestry */
const RUNGS = [
	{
		source: "frames/home/frame.tsx:10:3",
		name: "main",
		className: "flex flex-col",
		path: "design/frames/home/frame.tsx",
		line: 10,
	},
	{
		source: "frames/home/frame.tsx:11:3",
		name: "footer",
		className: "flex gap-2",
		path: "design/frames/home/frame.tsx",
		line: 11,
	},
	{
		source: "frames/home/frame.tsx:12:3",
		name: "PayButton",
		className: "rounded-md px-3 hover:bg-thread hover:text-on-thread",
		path: "design/frames/home/frame.tsx",
		line: 12,
	},
];

/** what the file holds for `DEEP`, one stamp per rung of it */
const DEEP_RUNGS = ["main", "header", "nav", "list", "item", "row", "label", "PayButton"].map((name, depth) => ({
	source: `frames/home/frame.tsx:${10 + depth}:3`,
	name,
	className: "flex",
	path: "design/frames/home/frame.tsx",
	line: 10 + depth,
}));

it("says select an element with nothing held, and how many with several", async () => {
	const { host, canvas } = await readyCanvas();

	expect(rail(host)?.textContent).toContain("select an element");

	await clickAt(canvas, 40, 40);
	expect(rail(host)?.textContent).not.toContain("select an element");

	// a marquee over both frames: one rail cannot stand for two rectangles
	await marqueeOver(canvas);
	expect(rail(host)?.textContent).toContain("2 frames");
});

it("shows a frame's own x, y, w and h in raw pixels, and writes one back", async () => {
	const { host, canvas } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	expect(fieldFor(host, "x")?.value).toBe("0");
	expect(fieldFor(host, "w")?.value).toBe("640");
	expect(rail(host)?.textContent).toContain("frame.json");

	await typeInto(fieldFor(host, "w"), "700");
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 700, h: 480 } });
	expect(fieldFor(host, "w")?.value).toBe("700");

	// one field is one press of undo, on the stack a drag joins
	await press("z", { metaKey: true, ctrlKey: true });
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 640, h: 480 } });
});

it("scrubs a frame's w against the screen alone, and writes once at release", async () => {
	const { host, canvas } = await readyCanvas();
	await clickAt(canvas, 40, 40);

	const label = rowLabel(host, "w");
	if (label === null) throw new Error("the w row kept no label");
	await act(async () => {
		label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }));
	});
	for (const x of [110, 120, 130, 140]) {
		await act(async () => {
			label.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, pointerId: 7 }));
		});
	}
	// mid-scrub the field ticks and the frame follows, but nothing is written:
	// a write per tick echoes back through the stream and stomps newer state
	expect(fieldFor(host, "w")?.value).toBe("680");
	expect(await geometryPut()).toBeUndefined();

	await act(async () => {
		label.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
	});
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 680, h: 480 } });

	// the whole scrub is one press of undo, like the drag it stands in for
	await press("z", { metaKey: true, ctrlKey: true });
	expect(await geometryPut()).toEqual({ home: { x: 0, y: 0, w: 640, h: 480 } });
});

it("crumbs the frame and every rung above the one held, by the names the file gave them", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);

	await until(() => crumbs(host).length === 4);
	expect(crumbs(host)).toEqual(["home", "main", "footer", "PayButton"]);
	// the tag beside them is the live one, so a component says what it renders as
	expect(rail(host)?.textContent).toContain("span");
});

it("climbs when a crumb is pressed, and takes the frame from the one at the root", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await pressCrumb(host, "footer");
	expect(await heldElements()).toEqual(["footer"]);
	expect(crumbs(host)).toEqual(["home", "main", "footer"]);

	await pressCrumb(host, "home");
	expect(await heldFrames()).toEqual(["home"]);
	expect(fieldFor(host, "x")).not.toBeNull();
});

it("elides the middle of a trail too deep for the rail, and the … reaches what it hides", async () => {
	const { host, canvas, frame } = await readyCanvas();
	filed = DEEP_RUNGS;
	layCrumbs(240);
	await descendTo(canvas, frame, 8, DEEP);
	await until(() => crumbs(host).length === 3);

	// the frame, the rung held, and one `…` for the rest: what will not fit is
	// dropped whole rather than every crumb squeezing down to two letters
	expect(crumbs(host)).toEqual(["home", "…", "PayButton"]);

	await press("click", {}, host.querySelector<HTMLElement>('button[aria-label="Skipped rungs"]'));
	expect(skippedRungs(host)).toEqual(["main", "header", "nav", "list", "item", "row", "label"]);

	// a rung the trail could not draw is still a rung a press climbs to
	await press("click", {}, menuItem(host, "nav"));
	expect(await heldElements()).toEqual(["nav"]);
});

it("reads the same trail whole once the rail is wide enough for it", async () => {
	const { host, canvas, frame } = await readyCanvas();
	filed = DEEP_RUNGS;
	layCrumbs(2000);
	await descendTo(canvas, frame, 8, DEEP);

	await until(() => crumbs(host).length === 9);
	expect(crumbs(host)).toEqual(["home", "main", "header", "nav", "list", "item", "row", "label", "PayButton"]);
});

it("carries the base and every scope the literal has, and edits under the one pressed", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	expect(chips(host)).toEqual(["base", "hover:"]);
	// the base is every token's scope: at the base nothing is out of view, so
	// the whole literal reads at one strength
	expect(rail(host)?.textContent).toContain("hover:bg-thread");
	expect(dimmedTokens(host)).toEqual([]);

	// under a variant the rest of the literal dims, which is what makes the bar
	// a lens over one literal rather than a filter that hides the others
	await pressChip(host, "hover:");
	expect(dimmedTokens(host)).toEqual(["rounded-md", "px-3"]);
});

it("offers this project's own breakpoints to open a scope on, not Tailwind's", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	await press("+", {}, host.querySelector<HTMLElement>('[aria-label="Open a scope"]'));
	const offered = [...(rail(host)?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");

	// the compiled theme renamed the breakpoints, so `md:` is a scope this
	// project does not have and `app:` is the one it does
	expect(offered.some((says) => says.startsWith("app:"))).toBe(true);
	expect(offered.some((says) => says.startsWith("md:"))).toBe(false);
	expect(offered.some((says) => says.startsWith("focus:"))).toBe(true);
});

it("greys the scope bar on a literal no hand may write, rather than hiding it", async () => {
	const { host, canvas, frame } = await readyCanvas({ refused: true });
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	// a missing control reads as a bug; a greyed one teaches you the shape of
	// your own code, so both the chips and the `+` stay and lose their box
	expect(rail(host)?.textContent).toContain("className is an expression");
	expect(host.querySelector<HTMLButtonElement>('[aria-label="Open a scope"]')?.disabled).toBe(true);
	expect(host.querySelector('[aria-label="remove hover:"]')).toBeNull();
});

it("drops every token under a scope in one write, and falls back to the base", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);
	await pressChip(host, "hover:");

	await press("×", {}, host.querySelector<HTMLElement>('[aria-label="remove hover:"]'));
	const gated = await gatedOps();
	expect(gated).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "bg-thread", scope: "hover:", remove: true },
		{
			kind: "set-class",
			source: "frames/home/frame.tsx:12:3",
			token: "text-on-thread",
			scope: "hover:",
			remove: true,
		},
	]);
	expect(chips(host).filter((chip) => chip === "hover:")).toHaveLength(1);
});

it("is the whole column while the agent experiment is off", async () => {
	const { host } = await readyCanvas();

	expect(rail(host)?.style.width).toBe("300px");
	// off is absent rather than hidden: there is no strip to press and nothing
	// in the document for a key to find
	expect(host.querySelector('[aria-label="Expand agent"]')).toBeNull();
	expect(host.querySelector('[aria-label="Agent"]')).toBeNull();
});

it("hands the column over to the agent's strip, and takes it back from its own", async () => {
	const { host } = await readyCanvas({ agentPanel: true });

	// the agent's own 44px strip is the switch, and never a tab row
	expect(rail(host)?.style.width).toBe("300px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("44px");

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Expand agent"]'));
	// one column, one rail: properties leave for a strip of their own
	expect(rail(host)?.style.width).toBe("44px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("420px");

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Expand properties"]'));
	expect(rail(host)?.style.width).toBe("300px");
	expect(host.querySelector<HTMLElement>('[aria-label="Agent"]')?.style.width).toBe("44px");
});

it("writes a row's change to the lane as one op under the live scope", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);
	await pressChip(host, "hover:");

	await typeInto(fieldFor(host, "opacity"), "60");
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "opacity-60", scope: "hover:" },
	]);
});

it("keeps the rung it is editing when its own write reloads the frame", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await typeInto(fieldFor(host, "opacity"), "60");
	await changed("home");
	await frame.loaded();

	// the reload would have dropped the pick, which would empty the surface the
	// edit was made from between one keystroke and the next (#258)
	expect(crumbs(host)).toEqual(["home", "main", "footer", "PayButton"]);
	// and the fresh document is asked for the same element, so the geometry the
	// overlay draws is the one the new render produced
	expect(frame.asked()).toMatchObject({ spool: "kin", selector: "pay", step: "self" });
	await frame.answer(CHAIN);
	expect(await heldElements()).toEqual(["pay"]);
});

it("reads a token the hands wrote in thread colour, and the author's own quietly", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	expect(splicedTokens(host)).toEqual([]);

	await typeInto(fieldFor(host, "opacity"), "60");
	payLiteral = `${RUNGS[2]?.className ?? ""} opacity-60`;
	await changed("home");
	await frame.loaded();
	await frame.answer(CHAIN);
	await until(() => splicedTokens(host).length > 0);

	// what you changed reads in thread colour and what the file was written with
	// does not, which is how you tell your own work from the agent's
	expect(splicedTokens(host)).toEqual(["opacity-60"]);
	expect(rowLabel(host, "opacity")?.className).toContain("text-thread");
	expect(rowLabel(host, "border-radius")?.className).not.toContain("text-thread");
});

it("gates the `+` on the compiler, and lands what it accepts under the live scope", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => chips(host).length === 2);

	await press("click", {}, host.querySelector<HTMLElement>('[aria-label="Add a class"]'));
	await typeField(host.querySelector<HTMLInputElement>('input[placeholder="any class"]'), "foo-bar");
	// what the compiler refuses stays grey with its own reason, never hidden
	expect(candidate(host, "foo-bar")?.textContent).toContain("no utility foo-bar");
	expect(candidate(host, "foo-bar")?.disabled).toBe(true);

	// a candidate the compiler has not answered for reads as pending and cannot be
	// pressed: nothing downstream would catch it, because the write lane splices
	// text and never asks the compiler
	await typeField(host.querySelector<HTMLInputElement>('input[placeholder="any class"]'), "shrink-0");
	expect(candidate(host, "shrink-0")?.textContent).toContain("…");
	expect(candidate(host, "shrink-0")?.disabled).toBe(true);
	const before = await gates();
	await press("click", {}, candidate(host, "shrink-0"));
	expect(await gates()).toBe(before);

	await typeField(host.querySelector<HTMLInputElement>('input[placeholder="any class"]'), "md:hidden");
	await press("click", {}, candidate(host, "md:hidden"));
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "hidden", scope: "md:" },
	]);
});

it("removes a token from the source line, which is the only way back out for a `+`", async () => {
	const { host, canvas, frame } = await readyCanvas();
	await descendTo(canvas, frame, 3);
	await until(() => crumbs(host).length === 4);

	await press("click", {}, sourceToken(host, "hover:bg-thread"));
	expect(await gatedOps()).toEqual([
		{ kind: "set-class", source: "frames/home/frame.tsx:12:3", token: "bg-thread", scope: "hover:", remove: true },
	]);
});

/*
 * The string fields (#260). Same mechanics and same gate as the text edit out
 * on the canvas: one typed op, spliced into the characters between the quotes.
 */

it("draws a field for every string the element carries and writes one back", async () => {
	const { host, canvas, frame } = await readyCanvas();
	payAttributes = [{ name: "title", value: "pay now" }];
	await descendTo(canvas, frame, 3);
	await until(() => attributeRow(host, "title") !== null);

	expect(fieldFor(host, "title")?.value).toBe("pay now");
	await typeInto(fieldFor(host, "title"), "pay later");
	expect(await gatedOps()).toEqual([
		{ kind: "set-attribute", source: "frames/home/frame.tsx:12:3", name: "title", value: "pay later" },
	]);
});

it("shows a walk target and refuses to write it, because the arrow lives in flows", async () => {
	const { host, canvas, frame } = await readyCanvas();
	payAttributes = [{ name: "data-go", value: "receipt" }];
	await descendTo(canvas, frame, 3);
	await until(() => attributeRow(host, "data-go") !== null);

	expect(attributeRow(host, "data-go")?.textContent).toContain("receipt");
	expect(attributeRow(host, "data-go")?.textContent).toContain("walk target, edit in flows");
	expect(fieldFor(host, "data-go")).toBeNull();
});

it("names the expression where a value is not written literally", async () => {
	const { host, canvas, frame } = await readyCanvas();
	payAttributes = [{ name: "title", expression: "{item.name}" }];
	await descendTo(canvas, frame, 3);
	await until(() => attributeRow(host, "title") !== null);

	expect(attributeRow(host, "title")?.textContent).toContain("{item.name}");
	expect(attributeRow(host, "title")?.textContent).toContain("title is an expression");
	expect(fieldFor(host, "title")).toBeNull();
});

it("offers an image the project's own pictures, and swaps to the one picked", async () => {
	const { host, canvas, frame } = await readyCanvas();
	payAttributes = [{ name: "src", asset: "./old.png" }];
	await clickAt(canvas, 40, 40);
	await deepClickAt(canvas, 40, 40);
	await frame.answer(IMG_CHAIN);
	await until(() => attributeRow(host, "src") !== null);

	// the src is a menu rather than a box: an image is an import, so it is
	// chosen and never typed
	expect(attributeRow(host, "src")?.querySelector("[data-text-value]")).toBeNull();
	const menu = attributeRow(host, "src")?.querySelector<HTMLButtonElement>("button");
	expect(menu?.textContent).toContain("old.png");
	await press("click", {}, menu ?? null);
	const option = host.querySelector<HTMLElement>('[data-menu-option="logo.svg"]');
	expect(option).not.toBeNull();
	await press("click", {}, option);

	expect(await lastSwap()).toMatchObject({
		frame: "home",
		source: "frames/home/frame.tsx:12:3",
		fingerprint: "f",
		asset: "shared/assets/logo.svg",
	});
});

// --- the harness -------------------------------------------------------------

const rail = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Properties"]');

/** the crumbs, in order, as they read */
function crumbs(host: HTMLElement): string[] {
	const line = rail(host)?.querySelector("[data-properties-crumbs]");
	return [...(line?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");
}

/** the rungs the `…` stands for, as its menu lists them */
function skippedRungs(host: HTMLElement): string[] {
	return [...host.querySelectorAll('[role="menu"][aria-label="Skipped rungs"] [role="menuitem"]')].map(
		(item) => item.textContent ?? "",
	);
}

function menuItem(host: HTMLElement, label: string): HTMLElement | null {
	return (
		[...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === label) ?? null
	);
}

/** every crumb 60 wide and 4 apart in a row `wide` across, which happy-dom lays out for nobody */
const CRUMB_WIDTH = 60;
const CRUMB_GAP = 4;

function layCrumbs(wide: number): void {
	const measured = Element.prototype.getBoundingClientRect;
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
		if (this.hasAttribute("data-properties-crumbs")) return new DOMRect(0, 0, wide, 18);
		const ruler = this.parentElement;
		if (ruler?.hasAttribute("data-crumb-ruler") !== true) return measured.call(this);
		return new DOMRect([...ruler.children].indexOf(this) * (CRUMB_WIDTH + CRUMB_GAP), 0, CRUMB_WIDTH, 18);
	});
}

/** the scope chips, in order */
function chips(host: HTMLElement): string[] {
	return [...(rail(host)?.querySelectorAll("[data-scope-chip]") ?? [])].map((chip) => chip.textContent ?? "");
}

/** the tokens on the source line drawn as the hands' own rather than the file's */
function splicedTokens(host: HTMLElement): string[] {
	const line = rail(host)?.querySelector("[data-properties-source]");
	return [...(line?.querySelectorAll(".text-thread") ?? [])].map((token) => (token.textContent ?? "").trim());
}

/** the CSS name at the left of one row */
function rowLabel(host: HTMLElement, row: string): HTMLElement | null {
	return rail(host)?.querySelector<HTMLElement>(`[data-properties-row="${row}"] > span`) ?? null;
}

/** the tokens on the source line drawn as out of the live scope */
function dimmedTokens(host: HTMLElement): string[] {
	const line = rail(host)?.querySelector("[data-properties-source]");
	return [...(line?.querySelectorAll(".text-muted\\/40") ?? [])].map((token) => (token.textContent ?? "").trim());
}

function fieldFor(host: HTMLElement, name: string): HTMLInputElement | null {
	return rail(host)?.querySelector<HTMLInputElement>(`[data-properties-row="${name}"] input`) ?? null;
}

async function pressCrumb(host: HTMLElement, name: string): Promise<void> {
	const line = rail(host)?.querySelector("[data-properties-crumbs]");
	const found = [...(line?.querySelectorAll("button") ?? [])].find((button) => button.textContent === name);
	await press("click", {}, found ?? null);
}

async function pressChip(host: HTMLElement, name: string): Promise<void> {
	const found = [...(rail(host)?.querySelectorAll("[data-scope-chip]") ?? [])].find(
		(chip) => chip.textContent === name,
	);
	await press("click", {}, (found as HTMLElement | undefined) ?? null);
}

/** one candidate in the `+` field's list */
function candidate(host: HTMLElement, token: string): HTMLButtonElement | null {
	return host.querySelector<HTMLButtonElement>(`[data-class-candidate="${token}"]`);
}

/** one token on the source line, which is a press that takes it off */
function sourceToken(host: HTMLElement, token: string): HTMLElement | null {
	const line = rail(host)?.querySelector("[data-properties-source]");
	return [...(line?.querySelectorAll<HTMLElement>("button") ?? [])].find((held) => held.textContent === token) ?? null;
}

/** typing without committing, which is what a find line and the `+` take */
async function typeField(field: HTMLInputElement | null, text: string): Promise<void> {
	if (field === null) throw new Error("no field");
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

async function typeInto(field: HTMLInputElement | null, text: string): Promise<void> {
	if (field === null) throw new Error("no field");
	// React tracks the value it last wrote, so a bare assignment reads as no
	// change at all: the native setter is what a real keystroke goes through
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => {
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	});
}

async function press(
	key: string,
	modifiers: Record<string, boolean> = {},
	target: HTMLElement | null = null,
): Promise<void> {
	await act(async () => {
		if (target !== null) target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		else window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

/** the geometry the canvas last wrote, which is `frame.json` and never source */
async function geometryPut(): Promise<Record<string, unknown> | undefined> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	const last = calls.filter(([input, init]) => String(input).endsWith("/geometry") && init?.method === "PUT").at(-1);
	return last === undefined
		? undefined
		: (JSON.parse(String(last[1]?.body)) as { frames: Record<string, unknown> }).frames;
}

/** how many times the write lane has been asked anything */
async function gates(): Promise<number> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return calls.filter(([input]) => String(input).endsWith("/patch/gate")).length;
}

/** the body of the last asset swap the canvas sent (#260) */
async function lastSwap(): Promise<Record<string, unknown> | undefined> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	const last = calls.filter(([input]) => String(input).endsWith("/asset")).at(-1);
	return last === undefined ? undefined : (JSON.parse(String(last[1]?.body)) as Record<string, unknown>);
}

/** one row of the attributes section, whichever control it holds */
function attributeRow(host: HTMLElement, name: string): HTMLElement | null {
	return rail(host)?.querySelector<HTMLElement>(`[data-properties-row="${name}"]`) ?? null;
}

/** the ops the last gate was asked about */
async function gatedOps(): Promise<unknown> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	const last = calls.filter(([input]) => String(input).endsWith("/patch/gate")).at(-1);
	return last === undefined ? undefined : (JSON.parse(String(last[1]?.body)) as { ops: unknown }).ops;
}

interface FramePlayer {
	answer: (chain: readonly PickedHit[]) => Promise<void>;
	/** what the canvas last asked this frame for */
	asked: () => Record<string, unknown> | undefined;
	/** the fresh document reporting for duty after a reload */
	loaded: () => Promise<void>;
}

/** Hold the rung `depth` down an ancestry: ⌘-click lands on the deepest one. */
async function descendTo(
	canvas: HTMLElement,
	frame: FramePlayer,
	depth: number,
	chain: readonly PickedHit[] = CHAIN,
): Promise<void> {
	await clickAt(canvas, 40, 40);
	await deepClickAt(canvas, 40, 40);
	await frame.answer(chain.slice(0, depth));
}

async function readyCanvas({
	agentPanel = false,
	refused = false,
}: {
	agentPanel?: boolean;
	refused?: boolean;
} = {}): Promise<{
	host: HTMLDivElement;
	canvas: HTMLElement;
	frame: FramePlayer;
}> {
	stubCanvasApis(refused);
	Object.assign(window, { __SPOOL_EXPERIMENTS__: agentPanel ? ["agent-panel"] : [] });
	window.localStorage?.clear();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	await act(async () => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	await until(() => host.querySelector('[data-frame-label="home"]') !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");

	await clickAt(canvas, 40, 40);
	await until(() => host.querySelector('iframe[title="home"]') !== null);

	const spies = new Map<Window, { mock: { calls: unknown[][] } }>();
	const live = (): Window | null => {
		const contentWindow = host.querySelector<HTMLIFrameElement>('iframe[title="home"]')?.contentWindow ?? null;
		if (contentWindow !== null && !spies.has(contentWindow)) {
			spies.set(contentWindow, vi.spyOn(contentWindow, "postMessage"));
		}
		return contentWindow;
	};
	await act(async () => {
		window.dispatchEvent(new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: live() }));
	});

	const asks = (): Record<string, unknown>[] => {
		live();
		return [...spies.values()]
			.flatMap((spy) => spy.mock.calls.map((call) => call[0]))
			.filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
			.filter((message) => message.spool === "pick" || message.spool === "kin")
			.sort((a, b) => Number(a.id) - Number(b.id));
	};

	// nothing is held after the boot click; the rail starts on its empty state
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});

	return {
		host,
		canvas,
		frame: {
			asked: () => asks().at(-1),
			loaded: async () => {
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", { data: { spool: "loaded", frame: "home" }, source: live() }),
					);
				});
				await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			},
			answer: async (chain) => {
				const ask = asks().at(-1);
				expect(ask).toBeDefined();
				await act(async () => {
					window.dispatchEvent(
						new MessageEvent("message", {
							data: { spool: "picked", frame: "home", id: ask?.id, chain },
							source: live(),
						}),
					);
				});
				await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			},
		},
	};
}

/** The daemon saying a frame's source changed, which is what reloads its document. */
async function changed(frame: string): Promise<void> {
	const line = `event: change\ndata: ${JSON.stringify({ kind: "frame", frame })}\n\n`;
	await act(async () => {
		events?.enqueue(new TextEncoder().encode(line));
	});
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

async function clickAt(canvas: HTMLElement, x: number, y: number, pointerId = 1): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId }),
		);
	});
}

/** ⌘-click: the deepest rung of whatever ancestry the frame answers with. */
async function deepClickAt(canvas: HTMLElement, x: number, y: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1, ...ACCEL }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
		);
	});
}

/** a drag across empty canvas that takes both frames in */
async function marqueeOver(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1500, clientY: 900, pointerId: 7 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: -40, clientY: -40, pointerId: 7 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: -40, clientY: -40, pointerId: 7 }),
		);
	});
}

/** Every selection the canvas has served, oldest first. */
async function served(): Promise<{ frames?: string[]; elements?: { selector: string }[] }> {
	await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
	const calls = (globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
	return (
		calls
			.filter(([input, init]) => String(input).endsWith("/selection") && init?.method === "PUT")
			.map(([, init]) => JSON.parse(String(init?.body)))
			.at(-1) ?? {}
	);
}

async function heldElements(): Promise<string[] | undefined> {
	return (await served()).elements?.map((element) => element.selector);
}

async function heldFrames(): Promise<string[] | undefined> {
	return (await served()).frames;
}

/** kaffe's compiled theme: one breakpoint of its own, and none of Tailwind's. */
const THEME = {
	colour: [{ name: "thread", value: "#F5391A", from: "project" }],
	text: [],
	weight: [],
	font: [],
	leading: [],
	tracking: [],
	radius: [],
	shadow: [],
	ease: [],
	screen: [{ name: "app", value: "1280px", from: "project" }],
	step: 4,
};

/** the daemon's event stream, held open so a test can push a change down it */
let events: ReadableStreamDefaultController<Uint8Array> | null = null;

/** the compiler's verdicts on whatever the `+` puts to it here */
const COMPILED = [
	{ ok: true, token: "md:hidden", css: "@media (width >= 48rem) { display: none }" },
	{ ok: false, token: "foo-bar", reason: "no utility foo-bar" },
];

/** which ancestry the file is answering about, which a trail too deep to draw swaps */
let filed: typeof RUNGS = RUNGS;
/** what the file says the held rung wears, which a write in a test moves */
let payLiteral = "";
/** the attributes the file writes on the held rung (#260) */
let payAttributes: { name: string; value?: string; expression?: string; asset?: string }[] = [];

function stubCanvasApis(refused = false): void {
	events = null;
	filed = RUNGS;
	payLiteral = RUNGS[2]?.className ?? "";
	payAttributes = [];
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal("open", vi.fn());
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/events")) {
				return new Response(
					new ReadableStream({
						start(controller) {
							events = controller;
						},
					}),
					{ headers: { "content-type": "text/event-stream" } },
				);
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			if (url.pathname.endsWith("/theme")) {
				return Response.json({ theme: THEME });
			}
			// the compiler as the gate on the `+` (#258's P5): the daemon's own
			// answer, so what the field offers is what this project compiles
			if (url.pathname.endsWith("/theme/classes")) {
				return Response.json({ compiled: COMPILED });
			}
			if (url.pathname.endsWith("/rungs")) {
				// the held rung reads whatever the file is now saying, so a write and
				// the re-read that follows it can both be driven from a test
				const held = filed.map((rung, at) =>
					at === filed.length - 1
						? { ...rung, className: payLiteral, attributes: payAttributes, fingerprint: "f" }
						: { ...rung, fingerprint: "f" },
				);
				return Response.json({ rungs: refused ? held.map(asExpression) : held });
			}
			// the imports a swap may choose from (#260), and the swap itself
			if (url.pathname.endsWith("/assets")) {
				return Response.json({
					assets: [
						{ path: "frames/home/hero.png", bytes: 2048 },
						{ path: "shared/assets/logo.svg", bytes: 512 },
					],
				});
			}
			if (url.pathname.endsWith("/asset")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					asset: "design/shared/assets/logo.svg",
					fingerprint: "g",
					mapped: false,
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 0, text: "", fingerprint: "g" },
				});
			}
			if (url.pathname.endsWith("/patch/gate")) {
				return Response.json({ ok: true, path: "design/frames/home/frame.tsx", fingerprint: "f", mapped: false });
			}
			if (url.pathname.endsWith("/patch")) {
				return Response.json({
					ok: true,
					path: "design/frames/home/frame.tsx",
					fingerprint: "g",
					mapped: false,
					undo: { path: "design/frames/home/frame.tsx", start: 0, end: 0, text: "", fingerprint: "g" },
				});
			}
			return Response.json({});
		}),
	);
	vi.stubGlobal(
		"EventSource",
		class {
			addEventListener() {}
			close() {}
		},
	);
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
