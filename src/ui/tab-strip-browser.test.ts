import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi } from "../test-helpers";

it("focuses projects across the tab surface while keeping close and drag separate", async () => {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { TabStrip } from "./src/ui/tab-strip";
				function App() {
					const [focused, setFocused] = useState("/w/alpha");
					return createElement(TabStrip, {
						tabs: [
							{ root: "/w/alpha", name: "alpha" },
							{ root: "/w/spool", name: "spool" },
						],
						focused,
						onFocus: (root) => {
							setFocused(root);
							document.body.dataset.focuses = String(Number(document.body.dataset.focuses ?? 0) + 1);
						},
						onClose: (root) => { document.body.dataset.closed = root; },
						onReorder: () => {},
						onPick: () => {},
					});
				}
				createRoot(document.getElementById("root")).render(createElement(App));
			`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		outfile: "tabs.js",
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const browser = await testBrowser();
	const page = await browser.newPage({ reducedMotion: "reduce" });
	await page.setContent(`<style>
		* { box-sizing: border-box; }
		body { margin: 0; font-family: sans-serif; }
		button { padding: 0; border: 0; background: transparent; font: inherit; }
		#root { height: 44px; }
	</style><div id="root"></div>`);
	// The tabs use the same compiled utilities as the app. esbuild alone only
	// bundles JavaScript and cannot supply their layout or hit areas.
	const assets = join(await builtUi(), "assets");
	for (const file of readdirSync(assets).filter((name) => name.endsWith(".css"))) {
		await page.addStyleTag({ content: readFileSync(join(assets, file), "utf8") });
	}
	for (const file of bundle.outputFiles) {
		if (file.path.endsWith(".css")) await page.addStyleTag({ content: file.text });
		else await page.addScriptTag({ content: file.text });
	}
	const tab = page.locator('[data-tab="/w/spool"]');
	await tab.waitFor();
	const box = await tab.boundingBox();
	if (box === null) throw new Error("missing tab box");
	const focuses = () => page.locator("body").getAttribute("data-focuses");
	const points = [
		{ name: "label", x: 20, y: 18 },
		{ name: "space after the name", x: box.width - 34, y: 18 },
		{ name: "above close", x: box.width - 16, y: 3 },
		{ name: "below close", x: box.width - 16, y: box.height - 3 },
		{ name: "right edge", x: box.width - 2, y: 18 },
		{ name: "bottom edge", x: box.width / 2, y: box.height + 2 },
	];
	let count = 0;
	for (const point of points) {
		await page.getByRole("button", { name: "alpha", exact: true }).click();
		count += 1;
		for (const state of ["inactive", "active"]) {
			await page.mouse.click(box.x + point.x, box.y + point.y);
			count += 1;
			expect(await focuses(), `${state}: ${point.name}`).toBe(String(count));
			expect(await tab.locator(".project-tab-label").getAttribute("aria-current")).toBe("page");
		}
	}

	await tab.getByRole("button", { name: "Close spool" }).click();
	expect(await page.locator("body").getAttribute("data-closed")).toBe("/w/spool");
	expect(await focuses()).toBe(String(count));

	await page.mouse.move(box.x + box.width - 34, box.y + 18);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 54, box.y + 18, { steps: 5 });
	await page.mouse.up();
	expect(await focuses()).toBe(String(count));

	await tab.locator(".project-tab-label").focus();
	await page.keyboard.press("Enter");
	expect(await focuses()).toBe(String(count + 1));
});

interface Sample {
	readonly t: number;
	readonly [key: string]: number | null;
}

/**
 * The strip with motion on, in a header as wide as `width`, driven from the
 * page: `window.strip` closes, opens, reorders and focuses tabs as the app
 * would, and closing the focused tab hands focus to its right-hand neighbour,
 * or its left one when it was last.
 */
async function strip({ width = 900, reduced = false, names = ["alpha", "beta", "gamma-delta", "epsilon"] } = {}) {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { TabStrip } from "./src/ui/tab-strip";
				const initial = ${JSON.stringify(names)}.map((name) => ({ root: "/w/" + name, name }));
				function App() {
					const [tabs, setTabs] = useState(initial);
					const [focused, setFocused] = useState(initial[0].root);
					const close = (root) => {
						setTabs((current) => {
							const index = current.findIndex((tab) => tab.root === root);
							const next = current.filter((tab) => tab.root !== root);
							setFocused((was) => was !== root ? was : (next[index] ?? next[index - 1])?.root ?? null);
							return next;
						});
						document.body.dataset.closed = (document.body.dataset.closed ?? "") + root + ";";
					};
					window.strip = {
						close,
						open: (name, focus = true) => {
							setTabs((current) => [...current, { root: "/w/" + name, name }]);
							if (focus) setFocused("/w/" + name);
						},
						order: (roots) => setTabs((current) => roots.map((root) => current.find((tab) => tab.root === root))),
						focus: setFocused,
						roots: () => [...document.querySelectorAll("[data-tab]")].map((tab) => tab.dataset.tab),
					};
					return createElement("header", { style: { display: "flex", height: "44px", width: "${width}px" } },
						createElement("div", { style: { display: "flex", minWidth: 0, flex: "1 1 auto", height: "100%" } },
							createElement(TabStrip, {
								tabs,
								focused,
								onFocus: setFocused,
								onClose: close,
								onReorder: window.strip.order,
								onPick: () => {},
							})));
				}
				createRoot(document.getElementById("root")).render(createElement(App));
			`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		outfile: "strip.js",
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const browser = await testBrowser();
	const page = await browser.newPage({ reducedMotion: reduced ? "reduce" : "no-preference" });
	await page.setContent(`<style>body { margin: 0; }</style><div id="root"></div>`);
	const assets = join(await builtUi(), "assets");
	for (const file of readdirSync(assets).filter((name) => name.endsWith(".css"))) {
		await page.addStyleTag({ content: readFileSync(join(assets, file), "utf8") });
	}
	for (const file of bundle.outputFiles) await page.addScriptTag({ content: file.text });
	await page.locator("[data-tab]").first().waitFor();
	return page;
}

/**
 * Run `act` in the page, then read `probe` on every frame for `ms`, and on until
 * its reading holds still: a loaded runner paints the same motion in fewer, later
 * frames, and the last sample is still where it came to rest. The probe is the
 * body of a function of `box(selector)` (a rect, or null) and `scroller`.
 */
async function frames(page: Page, act: string, probe: string, ms = 420): Promise<Sample[]> {
	return page.evaluate(
		async ({ act, probe, ms }) => {
			const box = (selector: string) => {
				const element = document.querySelector(selector);
				return element === null ? null : element.getBoundingClientRect();
			};
			const scroller = document.querySelector(".project-tabs-scroll") as HTMLElement;
			const read = new Function("box", "scroller", probe) as (
				b: typeof box,
				s: HTMLElement,
			) => Record<string, number | null>;
			const samples: Sample[] = [];
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const start = performance.now();
			samples.push({ t: -1, ...read(box, scroller) });
			new Function(act)();
			let still = 0;
			let last = "";
			while (performance.now() - start < ms || still < 3) {
				await new Promise((resolve) => requestAnimationFrame(resolve));
				const reading = read(box, scroller);
				const now = JSON.stringify(reading);
				still = now === last ? still + 1 : 0;
				last = now;
				samples.push({ t: performance.now() - start, ...reading });
			}
			return samples;
		},
		{ act, probe, ms },
	);
}

/**
 * How far into a settle every painted frame must still show the value on its
 * way. The house curve is 200 ms and steep: by 60 ms even a 30 px move is still
 * pixels from its end, so a frame then that has arrived is a leap or a cut
 * duration, not a slow machine.
 */
const UNDER_WAY_MS = 60;

/**
 * A value that travels from `from` to `to` over several frames, never back and
 * never in one leap. "Several" is read off the clock rather than counted: a
 * loaded runner paints fewer frames of the same motion, but every one of them
 * that lands early in it still shows the value part way.
 */
function expectGlide(samples: readonly Sample[], key: string, from: number, to: number) {
	const values = samples.map((sample) => sample[key] ?? 0);
	const trace = samples.map((sample, index) => `${Math.round(sample.t)}ms ${values[index]}`).join(", ");
	const direction = Math.sign(to - from);
	expect(values[0]).toBeCloseTo(from, 0);
	expect(values[values.length - 1]).toBeCloseTo(to, 0);
	for (let index = 1; index < values.length; index += 1) {
		const step = ((values[index] ?? 0) - (values[index - 1] ?? 0)) * direction;
		expect(step, `frame ${index}: ${trace}`).toBeGreaterThan(-0.5);
	}
	const away = (value: number) => Math.abs(value - from) > 1 && Math.abs(value - to) > 1;
	const moved = values.findIndex((value) => Math.abs(value - from) > 1);
	expect(moved, trace).toBeGreaterThan(0);
	// the motion began after the last frame that still showed `from`
	const began = samples[moved - 1]?.t ?? 0;
	expect(away(values[moved] ?? to), `the first frame to move leapt: ${trace}`).toBe(true);
	for (let index = moved; index < samples.length && (samples[index]?.t ?? 0) <= began + UNDER_WAY_MS; index += 1) {
		expect(away(values[index] ?? to), `${Math.round(samples[index]?.t ?? 0)}ms in: ${trace}`).toBe(true);
	}
}

/**
 * Wait out the strip's motion: until every slot, tab, selection and the scroll
 * hold still across a few painted frames, however slowly a loaded runner
 * paints them. A fixed pause guesses at the machine; this reads the row.
 */
async function atRest(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const read = () => {
			const parts = [...document.querySelectorAll(".project-tab-slot, [data-tab], .project-tab-selection")].map(
				(element) => {
					const box = element.getBoundingClientRect();
					return `${box.left},${box.width},${getComputedStyle(element).opacity}`;
				},
			);
			return `${document.querySelector(".project-tabs-scroll")?.scrollLeft}|${parts.join(";")}`;
		};
		let last = read();
		for (let still = 0; still < 3; ) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const now = read();
			still = now === last ? still + 1 : 0;
			last = now;
		}
	});
}

/** Wait for the selection to come to rest over a tab, however long a loaded runner takes to paint its slide. */
async function selectionRestsOn(page: Page, tab: string): Promise<{ x: number } | null> {
	const box = await page.locator(`[data-tab="${tab}"]`).boundingBox();
	await expect
		.poll(() => page.evaluate(() => document.querySelector(".project-tab-selection")?.getBoundingClientRect().left))
		.toBeCloseTo(box?.x ?? 0, 0);
	return box;
}

it("closes a tab between others by shrinking it while the ones after slide into its place", async () => {
	const page = await strip();
	const before = await page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll<HTMLElement>("[data-tab]")].map((tab) => [
				tab.dataset.tab,
				tab.getBoundingClientRect().left,
			]),
		),
	);
	const samples = await frames(
		page,
		`document.querySelector('[data-tab="/w/beta"] .project-tab-close').click();`,
		`return {
			gamma: box('[data-tab="/w/gamma-delta"]').left,
			epsilon: box('[data-tab="/w/epsilon"]').left,
			beta: box('.project-tab-slot:not([data-tab-slot])')?.width ?? null,
			hit: (() => { const b = box('.project-tab-slot:not([data-tab-slot])'); if (!b || b.width < 4) return null;
				const at = document.elementFromPoint(b.left + 2, b.top + 18); return at?.closest('.project-tab-slot:not([data-tab-slot])') ? 1 : 0; })(),
			measured: document.querySelectorAll('[data-tab]').length,
		};`,
	);
	expectGlide(samples, "gamma", before["/w/gamma-delta"] ?? 0, before["/w/beta"] ?? 0);
	// the tabs after it move as one
	for (const sample of samples)
		expect((sample.epsilon ?? 0) - (sample.gamma ?? 0)).toBeCloseTo(
			before["/w/epsilon"] - before["/w/gamma-delta"],
			0,
		);
	// the closing tab is gone at once to everything but the eye
	expect(samples.slice(1).every((sample) => sample.measured === 3)).toBe(true);
	expect(samples.some((sample) => sample.hit === 0)).toBe(true);
	expect(samples.some((sample) => sample.hit === 1)).toBe(false);
	// and gone from the row when it has shrunk away
	expect(samples[samples.length - 1]?.beta).toBeNull();
	expect(await page.locator(".project-tab-slot").count()).toBe(3);
});

it("opens a tab by growing it in place, and scrolls a full strip along with it", async () => {
	const page = await strip({ width: 420 });
	const end = await page.evaluate(() => {
		const scroller = document.querySelector(".project-tabs-scroll") as HTMLElement;
		return scroller.scrollWidth > scroller.clientWidth;
	});
	expect(end).toBe(true);
	const samples = await frames(
		page,
		`window.strip.open("zeta-the-new-one");`,
		`const slot = box('[data-tab-slot="/w/zeta-the-new-one"]');
		const view = scroller.getBoundingClientRect();
		return { width: slot?.width ?? null, scroll: scroller.scrollLeft, overhang: slot === null ? null : slot.right - view.right };`,
	);
	const full = samples[samples.length - 1]?.width ?? 0;
	expect(full).toBeGreaterThan(112);
	expectGlide(samples, "width", 0, full);
	const scrolls = samples.map((sample) => sample.scroll ?? 0);
	const max = await page.evaluate(() => {
		const scroller = document.querySelector(".project-tabs-scroll") as HTMLElement;
		return scroller.scrollWidth - scroller.clientWidth;
	});
	expectGlide(samples, "scroll", scrolls[0] ?? 0, max);
	// the new tab ends wholly in view
	expect(samples[samples.length - 1]?.overhang).toBeLessThanOrEqual(0.5);
	expect(await page.locator('[data-tab="/w/zeta-the-new-one"] .project-tab-label').getAttribute("aria-current")).toBe(
		"page",
	);
});

it("closes a tab in a strip scrolled to its end without the row jumping", async () => {
	const page = await strip({ width: 420, names: ["alpha", "beta", "gamma-delta", "epsilon", "zeta"] });
	// scrolled away from the focused first tab, to the far end
	await atRest(page);
	const end = await page.evaluate(() => {
		const scroller = document.querySelector(".project-tabs-scroll") as HTMLElement;
		scroller.scrollLeft = scroller.scrollWidth;
		return scroller.scrollLeft;
	});
	expect(end).toBeGreaterThan(100);
	const samples = await frames(
		page,
		`document.querySelector('[data-tab="/w/gamma-delta"] .project-tab-close').click();`,
		`return { last: box('[data-tab="/w/zeta"]').right, first: box('[data-tab="/w/alpha"]').left };`,
	);
	// the end of the row stays put while the content before the gap fills it from the left
	const last = samples.map((sample) => sample.last ?? 0);
	for (const value of last) expect(Math.abs(value - (last[0] ?? 0))).toBeLessThan(1);
	const first = samples.map((sample) => sample.first ?? 0);
	const settled = first[first.length - 1] ?? 0;
	expect(settled).toBeGreaterThan(first[0] ?? 0);
	expectGlide(samples, "first", first[0] ?? 0, settled);
});

it("keeps rapid closes and an open closed straight away free of ghosts and half tabs", async () => {
	const page = await strip({ names: ["alpha", "beta", "gamma-delta", "epsilon", "zeta", "eta"] });
	// three quick closes by the pointer, each on a tab still sliding from the last
	for (const name of ["beta", "gamma-delta", "epsilon"]) {
		await page.locator(`[data-tab="/w/${name}"]`).hover();
		await page.locator(`[data-tab="/w/${name}"] .project-tab-close`).click();
		await page.waitForTimeout(40);
	}
	// opened, then closed before it has finished growing
	await page.evaluate(() => (window as unknown as { strip: { open: (name: string) => void } }).strip.open("theta"));
	await page.waitForTimeout(60);
	await page.evaluate(() =>
		(window as unknown as { strip: { close: (root: string) => void } }).strip.close("/w/theta"),
	);
	// closed, then opened again while it is still shrinking: it comes back whole
	await page.evaluate(() =>
		(window as unknown as { strip: { close: (root: string) => void } }).strip.close("/w/zeta"),
	);
	await page.waitForTimeout(60);
	await page.evaluate(() => (window as unknown as { strip: { open: (name: string) => void } }).strip.open("zeta"));
	const read = () =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>(".project-tab-slot")].map((slot) => ({
				root: slot.dataset.tabSlot ?? null,
				width: slot.getBoundingClientRect().width,
				inner: (slot.firstElementChild as HTMLElement).getBoundingClientRect().width,
				opacity: getComputedStyle(slot).opacity,
			})),
		);
	// waited out rather than timed: a loaded runner paints the same motion late,
	// while a ghost or a half tab never settles at all
	await expect.poll(async () => (await read()).map((slot) => slot.root)).toEqual(["/w/alpha", "/w/eta", "/w/zeta"]);
	await expect
		.poll(async () =>
			(await read()).every((slot) => Math.abs(slot.width - slot.inner - 2) < 0.05 && slot.opacity === "1"),
		)
		.toBe(true);
	const slots = await read();
	expect(slots.map((slot) => slot.root)).toEqual(["/w/alpha", "/w/eta", "/w/zeta"]);
	for (const slot of slots) {
		expect(slot.width).toBeCloseTo(slot.inner + 2, 1);
		expect(slot.opacity).toBe("1");
	}
	await page.locator('[data-tab="/w/zeta"] .project-tab-label').click();
	expect(await page.locator('[data-tab="/w/zeta"] .project-tab-label').getAttribute("aria-current")).toBe("page");
});

it("slides the selection on to the tab that takes over from a closed focused tab", async () => {
	const page = await strip();
	const selection = `return { x: box(".project-tab-selection")?.left ?? null };`;
	// a tab between: its right-hand neighbour slides in under the selection, which stays put
	await page.locator('[data-tab="/w/beta"] .project-tab-label').click();
	const beta = await selectionRestsOn(page, "/w/beta");
	const between = await frames(
		page,
		`document.querySelector('[data-tab="/w/beta"] .project-tab-close').click();`,
		selection,
	);
	const trace = between.map((sample) => `${Math.round(sample.t)}ms ${sample.x}`).join(", ");
	for (const sample of between) expect(Math.abs((sample.x ?? 0) - (beta?.x ?? 0)), trace).toBeLessThan(1);
	expect(await page.locator('[data-tab="/w/gamma-delta"] .project-tab-label').getAttribute("aria-current")).toBe(
		"page",
	);
	// the last tab: the selection glides back to the tab on its left
	await page.locator('[data-tab="/w/epsilon"] .project-tab-label').click();
	const epsilon = await selectionRestsOn(page, "/w/epsilon");
	const gamma = await page.locator('[data-tab="/w/gamma-delta"]').boundingBox();
	const last = await frames(
		page,
		`document.querySelector('[data-tab="/w/epsilon"] .project-tab-close').click();`,
		selection,
	);
	expectGlide(last, "x", epsilon?.x ?? 0, gamma?.x ?? 0);
});

it("animates a reorder that arrives from elsewhere", async () => {
	const page = await strip();
	const before = await page.locator('[data-tab="/w/epsilon"]').boundingBox();
	const alpha = await page.locator('[data-tab="/w/alpha"]').boundingBox();
	const samples = await frames(
		page,
		`window.strip.order(["/w/epsilon", "/w/alpha", "/w/beta", "/w/gamma-delta"]);`,
		`return { x: box('[data-tab="/w/epsilon"]').left };`,
	);
	expectGlide(samples, "x", before?.x ?? 0, alpha?.x ?? 0);
});

it("drags a tab while another is still closing, keeping it under the pointer", async () => {
	const page = await strip();
	await page.locator('[data-tab="/w/alpha"] .project-tab-close').click();
	// straight on, while alpha is still shrinking and the tabs after it still sliding left
	const beta = await page.locator('[data-tab="/w/beta"]').boundingBox();
	if (beta === null) throw new Error("missing beta");
	const y = beta.y + 18;
	// on the name rather than near the close button, which the row could carry under the pointer
	let x = beta.x + 20;
	await page.mouse.move(x, y);
	await page.mouse.down();
	x += 12;
	await page.mouse.move(x, y);
	// whichever tab the row slid under the pointer is the one carried
	const held = await page.locator(".is-dragging").getAttribute("data-tab");
	const order = ["/w/beta", "/w/gamma-delta", "/w/epsilon"];
	const from = order.indexOf(held ?? "");
	expect(from === 0 || from === 1).toBe(true);
	// the pointer holds still while the row closes up under it: the tab stays in hand
	const offsets: number[] = [];
	for (let frame = 0; frame < 16; frame += 1) {
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
		const box = await page.locator(`[data-tab="${held}"]`).boundingBox();
		offsets.push(x - (box?.x ?? 0));
	}
	// within a frame of the row's slide: a loaded machine can show one frame's step, never a tab left behind
	for (const offset of offsets.slice(1)) expect(Math.abs(offset - (offsets[0] ?? 0))).toBeLessThan(3);
	// then carried just past the centre of the tab after it, with the row settled
	await atRest(page);
	const slots = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("[data-tab-slot]")].map((slot) => {
			const box = slot.getBoundingClientRect();
			return { left: box.left, right: box.right, center: box.left + box.width / 2 };
		}),
	);
	const travelled = (slots[from + 1]?.center ?? 0) + 6 - (slots[from]?.right ?? 0);
	await page.mouse.move(x - 12 + travelled, y, { steps: 4 });
	await page.mouse.up();
	await atRest(page);
	order.splice(from, 1);
	order.splice(from + 1, 0, held ?? "");
	expect(await page.evaluate(() => (window as unknown as { strip: { roots: () => string[] } }).strip.roots())).toEqual(
		order,
	);
	// and nothing is left standing off its slot
	const transforms = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("[data-tab]")].map((tab) => tab.style.transform),
	);
	expect(transforms.every((transform) => transform === "translateX(0px)")).toBe(true);
});

it("closes a tab by the middle button, and scrolls a full strip by a vertical wheel", async () => {
	const page = await strip({ width: 360 });
	const box = await page.locator('[data-tab="/w/beta"]').boundingBox();
	if (box === null) throw new Error("missing beta");
	await page.mouse.click(box.x + 30, box.y + 18, { button: "middle" });
	expect(await page.locator("body").getAttribute("data-closed")).toBe("/w/beta;");
	await atRest(page);
	const scroller = page.locator(".project-tabs-scroll");
	await scroller.evaluate((element) => {
		element.scrollLeft = 0;
	});
	await page.mouse.move(box.x + 30, box.y + 18);
	await page.mouse.wheel(0, 60);
	await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

it("does all of it at once under reduced motion", async () => {
	const page = await strip({ reduced: true });
	const beta = await page.locator('[data-tab="/w/beta"]').boundingBox();
	const samples = await frames(
		page,
		`document.querySelector('[data-tab="/w/beta"] .project-tab-close').click(); window.strip.open("zeta");`,
		`return { gamma: box('[data-tab="/w/gamma-delta"]').left, zeta: box('[data-tab-slot="/w/zeta"]')?.width ?? null,
			slots: document.querySelectorAll(".project-tab-slot").length };`,
		120,
	);
	for (const sample of samples.slice(2)) {
		expect(sample.gamma).toBeCloseTo(beta?.x ?? 0, 0);
		expect(sample.slots).toBe(4);
		expect(sample.zeta).toBe(samples[samples.length - 1]?.zeta);
	}
	expect(samples[samples.length - 1]?.zeta).toBeGreaterThan(100);
});

it("animates a close from the keyboard too, and hands the keyboard on to the next tab", async () => {
	const page = await strip();
	const before = await page.locator('[data-tab="/w/beta"]').boundingBox();
	const gamma = await page.locator('[data-tab="/w/gamma-delta"]').boundingBox();
	await page.locator('[data-tab="/w/beta"] .project-tab-close').focus();
	await page.keyboard.press("Shift");
	const samples = await frames(
		page,
		`document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); document.activeElement.click();`,
		`return { x: box('[data-tab="/w/gamma-delta"]').left };`,
	);
	expectGlide(samples, "x", gamma?.x ?? 0, before?.x ?? 0);
	expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-tab]")?.dataset.tab)).toBe(
		"/w/gamma-delta",
	);
});
