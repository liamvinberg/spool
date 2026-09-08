import { readFileSync, rmSync } from "node:fs";
import type { FrameLocator, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { SourceResult, UseOutcome } from "../source-edit";
import type { SourcePropertyPreview } from "../source-property";
import { writeDesignFile } from "../test-helpers";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const owner = "shared/card.tsx";
const cards = `import {useState,useEffect} from 'react';export function Card({label}){const [count,setCount]=useState(()=>{window.initializers=(window.initializers||0)+1;return 0});useEffect(()=>()=>{window.unmounts=(window.unmounts||0)+1},[]);return <section data-subject={label} className="p-6 opacity-75"><button onClick={()=>setCount(count=>count+1)}>{label}:{count}</button><input defaultValue="initial"/></section>}`;
const memoCards = `import {useState,useEffect,memo} from 'react';function State({label}){const [count,setCount]=useState(()=>{window.initializers=(window.initializers||0)+1;return 0});useEffect(()=>()=>{window.unmounts=(window.unmounts||0)+1},[]);return <><button onClick={()=>setCount(count=>count+1)}>{label}:{count}</button><input defaultValue="initial"/></>}const Leaf=memo(function Leaf({children}){return children},previous=>previous.hold);export function Card({label}){return <Leaf hold={label==='B'}><section data-subject={label} className="p-6 opacity-75"><State label={label}/></section></Leaf>}`;
const frameSource =
	'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:24}}><Card key="a" label="A"/><Card key="b" label="B"/></main>}';
type Canvas = Awaited<ReturnType<typeof originCanvas>>;

async function propertyCanvas(...args: Parameters<typeof originCanvas>) {
	const beforeLoad = args[4];
	args[4] = async (page) => {
		await page.addInitScript(() => {
			const messages: unknown[] = [];
			Reflect.set(window, "propertyMessages", messages);
			addEventListener("message", (event) => {
				if (
					event.data?.spool === "source-reply" ||
					(event.data?.spool === "source-request" && event.data.action === "preview-property")
				)
					messages.push(event.data);
			});
		});
		await beforeLoad?.(page);
	};
	return originCanvas(...args);
}

async function previewed(f: Canvas, response: ReturnType<typeof reply>, count: number) {
	const result = (await (await response).json()) as { ok: boolean; preview?: SourcePropertyPreview };
	expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
	const plan = result.preview;
	if (!plan) throw new Error("missing authenticated property preview");
	const requests = async () =>
		(
			await Promise.all(
				f.page.frames().map((frame) =>
					frame.evaluate((expected) => {
						const messages = Reflect.get(window, "propertyMessages") as {
							spool: string;
							id: string;
							preview?: SourcePropertyPreview;
						}[];
						return messages
							.filter(
								(message) =>
									message.spool === "source-request" &&
									message.preview?.generation === expected.generation &&
									message.preview.revision === expected.revision,
							)
							.map((message) => message.id);
					}, plan),
				),
			)
		).flat();
	await expect.poll(async () => (await requests()).length).toBe(count);
	const ids = await requests();
	await expect
		.poll(() =>
			f.page.evaluate((expectedIds) => {
				const messages = Reflect.get(window, "propertyMessages") as {
					spool: string;
					id: string;
					result: unknown;
				}[];
				return expectedIds.map(
					(id) => messages.find((message) => message.spool === "source-reply" && message.id === id)?.result,
				);
			}, ids),
		)
		.toEqual(Array.from({ length: count }, () => true));
}

function reply(f: Canvas, action: string) {
	return f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === action,
	);
}
function control(f: Canvas) {
	return f.page.locator('[data-properties-row="opacity"] input').first();
}
async function native(frame: FrameLocator | Page, opacity: string) {
	await expect
		.poll(() =>
			frame
				.locator("[data-subject]")
				.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity)),
		)
		.toEqual([opacity, opacity]);
}
async function remember(frame: FrameLocator | Page) {
	await frame.locator("[data-subject]").first().waitFor();
	await frame.locator("body").evaluate(() => {
		const nodes = [...document.querySelectorAll<HTMLElement>("[data-subject]")].map((element, index) => {
			const input = element.querySelector("input"),
				button = element.querySelector("button");
			if (!input || !button) throw new Error("missing authored native controls");
			for (let n = 0; n <= index; n++) button.click();
			input.value = `dirty ${index}`;
			input.setSelectionRange(2, 4);
			return { element, input, button };
		});
		Reflect.set(window, "sharedControlNodes", nodes);
	});
	await expect.poll(() => frame.locator("[data-subject] button").allTextContents()).toEqual(["A:1", "B:2"]);
}
async function retained(frame: FrameLocator | Page) {
	const result = await frame.locator("body").evaluate(() => {
		const nodes = Reflect.get(window, "sharedControlNodes") as {
			element: HTMLElement;
			input: HTMLInputElement;
			button: HTMLButtonElement;
		}[];
		return {
			initializers: Reflect.get(window, "initializers"),
			unmounts: Reflect.get(window, "unmounts") ?? 0,
			uses: nodes.map(({ element, input, button }, index) => ({
				identity:
					document.querySelectorAll("[data-subject]")[index] === element &&
					element.querySelector("input") === input &&
					element.querySelector("button") === button,
				value: input.value,
				caret: [input.selectionStart, input.selectionEnd],
				text: button.textContent,
			})),
		};
	});
	expect(result).toEqual({
		initializers: 2,
		unmounts: 0,
		uses: [
			{ identity: true, value: "dirty 0", caret: [2, 4], text: "A:1" },
			{ identity: true, value: "dirty 1", caret: [2, 4], text: "B:2" },
		],
	});
}
async function complete(f: Canvas, expected: string) {
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await control(f).press("Enter");
	const result = (await (await committed).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, writes: f.writes, source: f.bytes()[owner] })).toBe(true);
	await delivered;
	await expect.poll(() => f.bytes()[owner]).toBe(expected);
	await f.settled();
	return result;
}
async function outcomes(f: Canvas) {
	return f.page.evaluate(() => Reflect.get(window, "originOutcomes")) as Promise<UseOutcome[]>;
}

it("edits all four shared property uses through source history without resetting native state", {
	timeout: 120_000,
}, async () => {
	const f = await propertyCanvas({ [owner]: cards }, frameSource, '[data-subject="A"]', true);
	const second = f.page.frameLocator('iframe[title="second"]');
	for (const frame of [f.frame, second]) await remember(frame);
	await f.select();
	const reading = reply(f, "read");
	await control(f).fill("50");
	const original = await (await reading).json();
	expect(original, JSON.stringify(original)).toMatchObject({
		ok: true,
		read: { operation: { kind: "property", property: "opacity", scope: "" }, scope: "definition" },
	});
	expect(original.read.source).toMatch(/^shared\/card.tsx:/);
	for (const frame of [f.frame, second]) await native(frame, "0.5");
	expect(f.bytes()[owner]).toBe(cards);
	expect(f.writes).toEqual([]);
	const saved = cards.replace("opacity-75", "opacity-50");
	await complete(f, saved);
	for (const redo of [undefined, false, true]) {
		if (redo !== undefined) {
			const delivered = reply(f, "delivered");
			await f.history(redo);
			await delivered;
			await f.settled();
		}
		expect(f.bytes()[owner]).toBe(redo === false ? cards : saved);
		for (const frame of [f.frame, second]) {
			await native(frame, redo === false ? "0.75" : "0.5");
			await retained(frame);
		}
		const latest = (await outcomes(f)).slice(-2);
		expect
			.soft(
				latest.flatMap((result) => result.uses ?? [result]).map((use) => use.rendered),
				JSON.stringify(latest),
			)
			.toEqual(["verified", "verified", "verified", "verified"]);
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it.each([false, true])(
	"discloses the shared property owner without replacing the separate call-owned text scope (unknown style: %s)",
	{
		timeout: 120_000,
	},
	async (unknownStyle) => {
		const authored =
			'export function Card({label,id}){return <button id={id} className="opacity-75">{label}</button>}';
		const calls =
			'import {Card} from "./card";export function Calls(){return <><Card id="first" label="First"/><Card id="other" label="Other"/></>}';
		const f = await propertyCanvas(
			{ [owner]: authored, "shared/calls.tsx": calls },
			`import {Calls} from "shared/calls";export default function Frame(){${unknownStyle ? "const style={padding:40};" : ""}return <main style={${unknownStyle ? "style" : "{padding:40}"}}><Calls/></main>}`,
			"#first",
			true,
		);
		const second = f.page.frameLocator('iframe[title="second"]');
		await second.locator("#other").waitFor();
		await f.select();
		const disclosure = f.page.getByRole("button", { name: "Show affected uses", exact: true });
		await expect.poll(() => disclosure.textContent()).toBe("2");
		await disclosure.click();
		const panel = f.page.locator("[data-source-uses]");
		await expect.poll(() => panel.textContent()).toContain("repeated call site · shared/calls.tsx");
		const described = f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") &&
				response.request().postDataJSON()?.action === "describe" &&
				response.request().postDataJSON()?.operation?.kind === "property",
		);
		await control(f).focus();
		const description = await (await described).json();

		await expect.poll(() => panel.textContent()).toContain("shared definition · shared/card.tsx");
		expect(description.description.reach.uses).toHaveLength(4);
		expect(description.description.reach.unknown).toEqual(unknownStyle ? ["home", "second"] : []);
		expect(await disclosure.textContent()).toBe(unknownStyle ? "4+" : "4");
		expect(await f.page.getByText("Content", { exact: true }).locator("..").textContent()).toBe(
			"Contentrepeated call site",
		);
		await f.page.mouse.move(5, 5);
		for (const target of [f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
			await expect.poll(() => target.getAttribute("data-spool-shared-use")).toBe("");
		const preview = reply(f, "preview");
		await control(f).fill("50");
		await previewed(f, preview, 2);
		for (const target of [f.target, f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
			await expect.poll(() => target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.5");
		await control(f).press("Escape");
		for (const target of [f.target, f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
			await expect.poll(() => target.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.75");
		expect(f.bytes()).toEqual({ [owner]: authored, "shared/calls.tsx": calls });
		expect(f.writes).toEqual([]);
	},
);

it.each([
	{ name: "absent", attribute: "" },
	{ name: "empty", attribute: ' className=""' },
])(
	"creates, changes and removes opacity while restoring the original $name class field",
	{ timeout: 120_000 },
	async ({ attribute }) => {
		const authored = `export function Card(){return <button id="subject"${attribute}>Hello</button>}`;
		const f = await propertyCanvas(
			{ [owner]: authored },
			'import {Card} from "shared/card";export default function Frame(){return <main style={{padding:40}}><Card/></main>}',
			"#subject",
		);
		const created = authored.replace(`id="subject"${attribute}`, 'id="subject" className="opacity-50"');
		const changed = created.replace("opacity-50", "opacity-25"),
			removed = changed.replace('className="opacity-25"', "");
		const states = [authored, created, changed, removed];
		for (const [text, opacity, source] of [
			["50", "0.5", created],
			["25", "0.25", changed],
			["", "1", removed],
		]) {
			await f.select();
			const reading = reply(f, "read"),
				preview = reply(f, "preview");
			await control(f).fill(text!);
			const read = await (await reading).json();
			expect(read, JSON.stringify(read)).toMatchObject({ ok: true });
			await previewed(f, preview, 1);
			await expect.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity)).toBe(opacity);
			await complete(f, source!);
		}
		expect(await f.target.getAttribute("class")).toBeNull();
		for (const redo of [false, true])
			for (const step of [1, 2, 3]) {
				await inverse(f, redo);
				await f.settled();
				const index = redo ? step : 3 - step;
				expect(f.bytes()[owner]).toBe(states[index]);
				await expect
					.poll(() => f.target.evaluate((element) => getComputedStyle(element).opacity))
					.toBe(["1", "0.5", "0.25", "1"][index]);
				if (index === 0) expect(await f.target.getAttribute("class")).toBe(attribute ? "" : null);
				const latest = (await outcomes(f)).at(-1);
				expect.soft(latest, JSON.stringify(latest)).toMatchObject({ rendered: "verified" });
			}
		expect(f.writes).toEqual([
			"commit",
			"commit",
			"commit",
			"inverse",
			"inverse",
			"inverse",
			"inverse",
			"inverse",
			"inverse",
		]);
	},
);

async function inverse(f: Canvas, redo: boolean) {
	const response = reply(f, "inverse"),
		delivered = reply(f, "delivered");
	void delivered.catch(() => {});
	await f.history(redo);
	const result = (await (await response).json()) as SourceResult;
	expect(result.ok, JSON.stringify({ result, writes: f.writes, source: f.bytes()[owner] })).toBe(true);
	await delivered;
	await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	return result;
}

it("opens a cold property consumer from saved source and includes it in subsequent source inverses", {
	timeout: 120_000,
}, async () => {
	const f = await propertyCanvas(
		{ [owner]: cards, "frames/cold-page/cold/frame.tsx": frameSource },
		frameSource,
		'[data-subject="A"]',
	);
	await f.select();
	await control(f).fill("50");
	await native(f.frame, "0.5");
	const saved = cards.replace("opacity-75", "opacity-50");
	await complete(f, saved);
	const installed = await outcomes(f);
	expect(installed).toHaveLength(1);
	expect(await f.page.locator('iframe[title="cold"]').count()).toBe(0);
	await f.select();
	await control(f).focus();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	const panel = f.page.locator("[data-source-uses]");
	await expect.poll(() => panel.textContent()).toContain("1 unmounted source-dependent frame");
	await panel.getByRole("button", { name: "cold not mounted ↗", exact: true }).click();
	const cold = f.page.frameLocator('iframe[title="cold"]');
	await native(cold, "0.5");
	expect(await outcomes(f)).toEqual(installed);
	await remember(cold);
	for (const redo of [false, true]) {
		await inverse(f, redo);
		await expect.poll(() => f.bytes()[owner]).toBe(redo ? saved : cards);
		await native(cold, redo ? "0.5" : "0.75");
		await retained(cold);
		const latest = (await outcomes(f)).at(-1);
		expect.soft(latest, JSON.stringify(latest)).toMatchObject({ rendered: "verified" });
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("keeps a surviving shared consumer and unrelated source through inverse after the initiator disappears", {
	timeout: 120_000,
}, async () => {
	const other = "export const unrelated = 'keep me';\n";
	const f = await propertyCanvas(
		{ [owner]: cards, "shared/other.ts": other },
		frameSource,
		'[data-subject="A"]',
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await remember(second);
	await f.select();
	await control(f).fill("50");
	await native(second, "0.5");
	const saved = cards.replace("opacity-75", "opacity-50");
	await complete(f, saved);
	const changedOther = `${other}// independent edit\n`;
	writeDesignFile(f.project.root, "shared/other.ts", changedOther);
	rmSync(f.file("frames/home"), { recursive: true });
	await expect.poll(() => f.page.locator('iframe[title="home"]').count()).toBe(0);
	for (const redo of [false, true]) {
		await inverse(f, redo);
		await expect.poll(() => f.bytes()[owner]).toBe(redo ? saved : cards);
		await native(second, redo ? "0.5" : "0.75");
		await retained(second);
		expect(readFileSync(f.file("shared/other.ts"), "utf8")).toBe(changedOther);
		const latest = (await outcomes(f)).at(-1);
		expect.soft(latest, JSON.stringify(latest)).toMatchObject({ rendered: "verified" });
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("reports each shared memo use against ordinary React without borrowing a healthy sibling's result", {
	timeout: 120_000,
}, async () => {
	// The source owner rerenders; only the separate consumer may retain its old prop.
	const authored = memoCards;
	const frame = frameSource.replace("</main>", '<i hidden className="opacity-75"/></main>');
	const f = await propertyCanvas({ [owner]: authored }, frame, '[data-subject="A"]');
	const oracle = await originOracle(
		f,
		{
			[owner]: authored.replace('className="p-6 opacity-75"', 'className={window.oracleClass || "p-6 opacity-75"}'),
			"shared/oracle-frame.tsx": frame,
		},
		"shared/oracle-frame",
	);
	await oracle.addStyleTag({ content: ".opacity-75{opacity:.75}.opacity-50{opacity:.5}" });
	for (const document of [f.frame, oracle]) await remember(document);
	await f.select();
	const reading = reply(f, "read");
	await control(f).fill("50");
	const readResponse = await reading;
	const original = await readResponse.json();
	expect(original, JSON.stringify(original)).toMatchObject({ ok: true, read: { scope: "definition" } });
	expect(original.read.source).toMatch(/^shared\/card.tsx:/);
	const saved = authored.replace("opacity-75", "opacity-50");
	await complete(f, saved);
	for (const redo of [undefined, false, true]) {
		if (redo !== undefined) await inverse(f, redo);
		await oracle.evaluate(
			(value) => {
				Reflect.set(window, "oracleClass", value);
				Reflect.get(window, "oracleRender")();
			},
			redo === false ? "p-6 opacity-75" : "p-6 opacity-50",
		);
		const ordinary = await oracle
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
		expect(ordinary).toEqual(redo === false ? ["0.75", "0.75"] : ["0.5", "0.75"]);
		const actual = await f.frame
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
		expect.soft(actual).toEqual(ordinary);
		for (const document of [f.frame, oracle]) await retained(document);
		expect(f.bytes()[owner]).toBe(redo === false ? authored : saved);
		const latest = (await outcomes(f)).at(-1);
		expect
			.soft(
				(latest?.uses ?? []).map((use) => use.rendered),
				JSON.stringify(latest),
			)
			.toEqual(redo === false ? ["verified", "verified"] : ["verified", "mismatching"]);
	}
	const operation = { kind: "property", property: "opacity", scope: "" } as const;
	const stale = await f.frame
		.locator('[data-subject="B"]')
		.evaluate(
			(element, purpose) => window.__SPOOL_SOURCE__?.read(element as HTMLElement, 9001, "className", purpose),
			operation,
		);
	expect(stale?.value).toBe("p-6 opacity-75");
	const refused = await fetch(`${f.project.url}/api/p/${f.project.name}/source`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Spool-Control": f.project.controlToken },
		body: JSON.stringify({
			action: "read",
			frame: "home",
			original: stale,
			generation: 9001,
			observer: readResponse.request().postDataJSON().observer,
			operation,
			retry: false,
		}),
	});
	expect(await refused.json()).toMatchObject({
		ok: false,
		reason: "the committed class differs from its original source literal",
	});
	await f.frame.locator('[data-subject="B"]').evaluate(() => window.__SPOOL_SOURCE__?.cancel(9001));
	expect(f.bytes()[owner]).toBe(saved);
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("keeps recovery when an equal native color hides a retained reference in a separate memo consumer", {
	timeout: 120_000,
}, async () => {
	const authored = memoCards.replace("opacity-75", "text-brand");
	const frame = `import 'shared/tokens.css';${frameSource.replace("</main>", '<i hidden className="text-brand"/></main>')}`;
	const f = await propertyCanvas(
		{ [owner]: authored, "shared/tokens.css": "@theme {--color-brand:#123456;--color-equal:#123456;}" },
		frame,
		'[data-subject="A"]',
	);
	await remember(f.frame);
	await f.select();
	const choose = f.page.getByRole("button", { name: "Choose color", exact: true });
	await expect.poll(() => choose.getAttribute("title")).toBe("Linked to --color-brand");
	await choose.click();
	await f.page.getByRole("textbox", { name: "Find color token", exact: true }).fill("equal");
	const committed = reply(f, "commit"),
		delivered = reply(f, "delivered");
	await f.page.getByRole("button", { name: "Apply --color-equal", exact: true }).click();
	expect(await (await committed).json()).toMatchObject({ ok: true, source: "saved" });
	await delivered;
	await f.settled();
	expect(f.bytes()[owner]).toBe(authored.replace("text-brand", "text-equal"));
	expect(
		await f.frame
			.locator("[data-subject]")
			.evaluateAll((elements) =>
				elements.map((element) => ({ className: element.className, color: getComputedStyle(element).color })),
			),
	).toEqual([
		{ className: "p-6 text-equal", color: "rgb(18, 52, 86)" },
		{ className: "p-6 text-brand", color: "rgb(18, 52, 86)" },
	]);
	await retained(f.frame);
	const result = (await outcomes(f)).at(-1);
	expect
		.soft(
			result?.uses?.map((use) => use.rendered),
			JSON.stringify(result),
		)
		.toEqual(["verified", "unverified"]);
	const notice = f.page.locator("[data-properties-rail] [data-hand-notice]");
	expect(await notice.count()).toBe(1);
	expect(await notice.textContent()).toContain("Saved");
	expect(result?.uses?.[1]?.reason).toContain("committed class declaration");
	await f.page.keyboard.press("ControlOrMeta+z");
	await f.settled();
	expect(f.bytes()[owner]).toBe(authored);
	await retained(f.frame);
	expect((await outcomes(f)).at(-1)?.uses?.map((use) => use.rendered)).toEqual(["verified", "verified"]);
	await expect.poll(() => notice.count()).toBe(0);
});
