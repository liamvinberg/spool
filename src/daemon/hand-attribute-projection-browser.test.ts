import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const entry = "shared/field.tsx";
const frame = 'import Field from "shared/field";export default function Frame(){return <Field/>}';
const controls = [
	{ tag: "input", field: "defaultValue", dirty: false },
	{ tag: "input", field: "defaultValue", dirty: true },
	{ tag: "textarea", field: "defaultValue", dirty: false },
	{ tag: "textarea", field: "defaultValue", dirty: true },
	{ tag: "input", field: "value", dirty: false },
	{ tag: "textarea", field: "value", dirty: false },
];
it.each(controls)(
	"projects $tag $field (dirty=$dirty) through native Properties and source history",
	{ timeout: 120000 },
	async ({ tag, field: name, dirty }) => {
		const source = `import {useEffect,useRef,useState} from 'react';export default function Field(){const ref=useRef(null);const [count,set]=useState(0);useEffect(()=>{globalThis.kept=ref.current;globalThis.mounts=(globalThis.mounts??0)+1},[]);return <main style={{padding:40}}><${tag} id="label" ref={ref} ${name}="Before" ${name === "value" ? "readOnly" : ""}/><button id="count" onClick={()=>set(n=>n+1)}>{count}</button></main>}`;
		const f = await originCanvas({ [entry]: source }, frame, "#label");
		const oracle = await originOracle(
			f,
			{
				[entry]: `let editable="Before";globalThis.editField=value=>editable=value;${source.replace(`${name}="Before"`, `${name}={editable}`)}`,
			},
			entry,
		);
		const target = f.target;
		const comparison = oracle.locator("#label");
		const snapshot = (element: Element) => {
			const control = element as HTMLInputElement | HTMLTextAreaElement;
			return {
				value: control.value,
				defaultValue: control.defaultValue,
				valueAttribute: element.getAttribute("value"),
				sameNode: element === Reflect.get(globalThis, "kept"),
				mounts: Reflect.get(globalThis, "mounts"),
				count: document.getElementById("count")?.textContent,
			};
		};
		for (const app of [f.frame, oracle]) {
			await app.locator("#count").evaluate((element) => (element as HTMLButtonElement).click());
			await expect.poll(() => app.locator("#count").textContent()).toBe("1");
			if (dirty) await app.locator("#label").fill("Unsaved native input");
		}
		const initial = await target.evaluate(snapshot);
		expect(initial).toEqual(await comparison.evaluate(snapshot));
		await f.select();
		const field = f.page.getByRole("textbox", { name, exact: true });
		await field.fill("Preview");
		await expect.poll(() => target.evaluate((element, name) => Reflect.get(element, name), name)).toBe("Preview");
		if (name === "defaultValue") expect(await target.inputValue()).toBe(initial.value);
		await field.press("Escape");
		await expect.poll(() => target.evaluate(snapshot)).toEqual(initial);
		expect(f.bytes()).toEqual({ [entry]: source });
		await field.fill('After & "literal"');
		await field.press("Enter");
		const edited = source.replace(`${name}="Before"`, `${name}="After &amp; &quot;literal&quot;"`);
		for (let phase = 0; phase < 3; phase++) {
			if (phase) await f.history(phase === 2);
			await expect.poll(() => f.bytes()).toEqual({ [entry]: phase === 1 ? source : edited });
			await f.settled();
			await oracle.evaluate(
				(value) => {
					Reflect.get(globalThis, "editField")(value);
					Reflect.get(globalThis, "oracleRender")();
				},
				phase === 1 ? "Before" : 'After & "literal"',
			);
			expect(await target.evaluate(snapshot)).toEqual(await comparison.evaluate(snapshot));
			expect(await target.evaluate(snapshot)).toMatchObject({ sameNode: true, mounts: 1, count: "1" });
			expect(await f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(0);
		}
		const saved = await target.evaluate(snapshot);
		// Keeping the native control focused while filling the Properties field lets
		// the preview transport prove it does not itself move focus or the caret.
		await f.select();
		await field.focus();
		await target.evaluate((element) => {
			const input = element as HTMLInputElement;
			input.focus();
			input.setSelectionRange(2, 4, "backward");
		});
		const lease = await target.evaluate((element, name) => {
			const source = window.__SPOOL_SOURCE__;
			const read = source?.read(element as HTMLElement, 9191, name);
			return !!read && source?.preview(9191, "Focused preview");
		}, name);
		expect(lease).toBe(true);
		await target.evaluate(() => window.__SPOOL_SOURCE__?.cancel(9191));
		expect(
			await target.evaluate((element) => {
				const input = element as HTMLInputElement;
				return {
					focused: document.activeElement === input,
					start: input.selectionStart,
					end: input.selectionEnd,
					direction: input.selectionDirection,
				};
			}),
		).toEqual({ focused: true, start: 2, end: 4, direction: "backward" });
		expect(await target.evaluate(snapshot)).toEqual(saved);
	},
);

const aliases = [
	{ name: "htmlFor", native: "for", element: '<label id="label" htmlFor="Before">Label</label>' },
	{ name: "acceptCharset", native: "accept-charset", element: '<form id="label" acceptCharset="Before">Form</form>' },
	{ name: "tabIndex", native: "tabindex", element: '<div id="label" tabIndex="1">Tab</div>', before: "1", after: "2" },
	{
		name: "strokeWidth",
		native: "stroke-width",
		element:
			'<svg width="200" height="100"><rect id="label" x="0" y="0" width="180" height="80" stroke="red" strokeWidth="3"/></svg>',
		before: "3",
		after: "7",
	},
	{
		name: "viewBox",
		native: "viewBox",
		element:
			'<svg id="label" width="200" height="100" viewBox="0 0 200 100"><rect width="100" height="80" pointerEvents="none"/></svg>',
		before: "0 0 200 100",
		after: "0 0 300 150",
	},
	{
		name: "preserveAspectRatio",
		native: "preserveAspectRatio",
		element:
			'<svg id="label" width="200" height="100" preserveAspectRatio="none"><rect width="100" height="80" pointerEvents="none"/></svg>',
		before: "none",
		after: "xMidYMid meet",
	},
	{
		name: "xmlLang",
		native: "xml:lang",
		namespace: "http://www.w3.org/XML/1998/namespace",
		element: '<svg width="200" height="100"><text id="label" y="30" xmlLang="en">Language</text></svg>',
		before: "en",
		after: "sv",
	},
	{
		name: "xlinkTitle",
		native: "xlink:title",
		namespace: "http://www.w3.org/1999/xlink",
		element: '<svg width="200" height="100"><text id="label" y="30" xlinkTitle="Before">Title</text></svg>',
	},
];
it.each(aliases)(
	"projects React alias $name without changing its authored field",
	{ timeout: 120000 },
	async (sample) => {
		const source = `export default function Field(){return <main style={{padding:40}}>${sample.element}</main>}`;
		const before = sample.before ?? "Before",
			after = sample.after ?? 'After & "literal"';
		const f = await originCanvas({ [entry]: source }, frame, "#label");
		await f.select();
		const field = f.page.getByRole("textbox", { name: sample.name, exact: true });
		await field.fill(after);
		await expect.poll(() => f.target.getAttribute(sample.native)).toBe(after);
		await field.press("Escape");
		await expect.poll(() => f.target.getAttribute(sample.native)).toBe(before);
		expect(f.bytes()).toEqual({ [entry]: source });
		await field.fill(after);
		await field.press("Enter");
		const edited = source.replace(
			`${sample.name}="${before}"`,
			`${sample.name}="${after.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`,
		);
		for (let phase = 0; phase < 3; phase++) {
			if (phase) await f.history(phase === 2);
			await expect.poll(() => f.bytes()).toEqual({ [entry]: phase === 1 ? source : edited });
			await f.settled();
			expect(await f.target.getAttribute(sample.native)).toBe(phase === 1 ? before : after);
			if (sample.namespace)
				expect(
					await f.target.evaluate(
						(element, { namespace, native }) => element.getAttributeNS(namespace, native.split(":")[1]!),
						{ namespace: sample.namespace, native: sample.native },
					),
				).toBe(phase === 1 ? before : after);
			expect(await f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(0);
		}
	},
);

it.each([false, true])(
	"keeps title DOM presence distinct from an empty title (initially present=%s)",
	{ timeout: 120000 },
	async (present) => {
		const source = `export default function Field(){return <main style={{padding:40}}><h1 id="label"${present ? ' title=""' : ""}>Label</h1></main>}`;
		const f = await originCanvas({ [entry]: source }, frame, "#label");
		await f.select();
		const field = f.page.getByRole("textbox", { name: "title", exact: true });
		await field.fill("Preview");
		await expect.poll(() => f.target.getAttribute("title")).toBe("Preview");
		await field.press("Escape");
		await expect.poll(() => f.target.getAttribute("title")).toBe(present ? "" : null);
		expect(f.bytes()).toEqual({ [entry]: source });
		await field.fill("Saved");
		await field.press("Enter");
		await expect.poll(() => f.target.getAttribute("title")).toBe("Saved");
		await f.settled();
		const saved = f.bytes();
		for (const redo of [false, true]) {
			await f.history(redo);
			await expect.poll(() => f.bytes()).toEqual(redo ? saved : { [entry]: source });
			await f.settled();
			expect(await f.target.getAttribute("title")).toBe(redo ? "Saved" : present ? "" : null);
			expect(await f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(0);
		}
	},
);

it("keeps an authored computed title outside the literal source role", { timeout: 120000 }, async () => {
	const source =
		'export default function Field(){const title="Before";return <main style={{padding:40}}><h1 id="label" title={title.toUpperCase()}>Label</h1></main>}';
	const f = await originCanvas({ [entry]: source }, frame, "#label");
	await f.select();
	await expect.poll(() => f.page.getByRole("textbox", { name: "Text", exact: true }).count()).toBe(1);
	expect(await f.page.getByRole("textbox", { name: "title", exact: true }).count()).toBe(0);
	expect(f.writes).toEqual([]);
	expect(f.bytes()).toEqual({ [entry]: source });
	expect(await f.target.getAttribute("title")).toBe("BEFORE");
});

it.each([false, true])(
	"retains select value and option selection through cancel and history (multiple=%s)",
	{ timeout: 120000 },
	async (multiple) => {
		const source = `export default function Field(){return <main style={{padding:40}}><select id="label" value="a" ${multiple ? "multiple" : ""}><option value="a" style={{pointerEvents:"none"}}>Alpha</option><option value="b" style={{pointerEvents:"none"}}>Beta</option><option value="c" style={{pointerEvents:"none"}}>Gamma</option></select></main>}`;
		const f = await originCanvas({ [entry]: source }, frame, "#label");
		const oracle = await originOracle(
			f,
			{
				[entry]: `let editable="a";globalThis.editField=value=>editable=value;${source.replace('value="a"', "value={editable}")}`,
			},
			entry,
		);
		const selected = (element: Element) =>
			[...(element as HTMLSelectElement).options].map((option) => option.selected);
		for (const app of [f.frame, oracle])
			await app.locator("#label").evaluate((element, multiple) => {
				Reflect.set(globalThis, "keptSelect", element);
				if (multiple) (element as HTMLSelectElement).options[1]!.selected = true;
			}, multiple);
		const initial = await f.target.evaluate(selected);
		await f.select();
		const field = f.page.getByRole("textbox", { name: "value", exact: true });
		await field.fill("c");
		await expect.poll(() => f.target.inputValue()).toBe("c");
		await field.press("Escape");
		await expect.poll(() => f.target.evaluate(selected)).toEqual(initial);
		await field.fill("b");
		await field.press("Enter");
		for (let phase = 0; phase < 3; phase++) {
			if (phase) await f.history(phase === 2);
			await expect
				.poll(() => f.bytes())
				.toEqual({ [entry]: phase === 1 ? source : source.replace('value="a"', 'value="b"') });
			await f.settled();
			await oracle.evaluate(
				(value) => {
					Reflect.get(globalThis, "editField")(value);
					Reflect.get(globalThis, "oracleRender")();
				},
				phase === 1 ? "a" : "b",
			);
			expect(await f.target.evaluate(selected)).toEqual(await oracle.locator("#label").evaluate(selected));
			expect(await f.target.evaluate((element) => element === Reflect.get(globalThis, "keptSelect"))).toBe(true);
			expect(await f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(0);
		}
	},
);

it.each(["input", "textarea"])(
	"does not replay application getters while projecting a native %s field",
	{ timeout: 120000 },
	async (tag) => {
		const source = `export default function Field(){return <main style={{padding:40}}><${tag} id="label" defaultValue="Before"/></main>}`;
		const f = await originCanvas({ [entry]: source }, frame, "#label");
		await f.select();
		const evidence = await f.target.evaluate((element) => {
			let reads = 0;
			const prototype = element.localName === "input" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
			for (const name of ["value", "defaultValue", "type", "selectionStart", "selectionEnd", "selectionDirection"]) {
				const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
				Object.defineProperty(element, name, {
					configurable: true,
					get() {
						reads++;
						return descriptor.get!.call(element);
					},
					...(descriptor.set
						? {
								set(value: unknown) {
									descriptor.set!.call(element, value);
								},
							}
						: {}),
				});
			}
			const runtime = window.__SPOOL_SOURCE__!;
			const original = runtime.read(element as HTMLElement, 9999, "defaultValue");
			const previewed = runtime.preview(9999, "Preview");
			Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, "Typed during preview");
			runtime.cancel(9999);
			return {
				reads,
				original: original?.value,
				previewed,
				value: Object.getOwnPropertyDescriptor(prototype, "defaultValue")!.get!.call(element),
				current: Object.getOwnPropertyDescriptor(prototype, "value")!.get!.call(element),
			};
		});
		expect(evidence).toEqual({
			reads: 0,
			original: "Before",
			previewed: true,
			value: "Before",
			current: "Typed during preview",
		});
		expect(f.bytes()).toEqual({ [entry]: source });
	},
);
