import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const frameSource = 'import Example from "shared/composition";export default function Frame(){return <Example/>}';
const denied = [
	{
		name: "generated data label",
		definition: "function Label({label}){return <span>{label}</span>}",
		body: '{["Same","Same"].map((label,index)=><Label key={index} label={label}/>)}',
		selector: "span",
	},
	{
		name: "uppercase computed label",
		definition: "function Label({label}){return <span>{label.toUpperCase()}</span>}",
		body: '<Label label="SAME"/>',
		selector: "span",
	},
	{
		name: "duplicate literal title",
		definition: "",
		body: '<span title="Same" title="Same">Literal text</span>',
		selector: "span",
		attribute: true,
	},
	{
		name: "spread with literal title",
		definition: "",
		body: '<span title="Same" {...{title:"Same"}}>Literal text</span>',
		selector: "span",
		attribute: true,
	},
];
it.each(denied)("refuses $name through actual canvas without source writes", { timeout: 120000 }, async (sample) => {
	const source = `${sample.definition}export default function Example(){return <main style={{padding:40}}>${sample.body}<input id="draft" defaultValue="Native"/></main>}`;
	const files = { "shared/composition.tsx": source };
	const f = await originCanvas(files, frameSource, sample.selector);
	const normal = await originOracle(f, files, "shared/composition.tsx");
	const shape = async (app: typeof f.frame | typeof normal) =>
		app.locator("main").evaluate((el) => ({
			text: el.querySelector("span")?.textContent,
			title: el.querySelector("span")?.getAttribute("title"),
		}));
	expect(await shape(f.frame)).toEqual(await shape(normal));
	const box = await f.select();
	if (sample.attribute) {
		await expect.poll(() => f.page.getByRole("textbox", { name: "Text", exact: true }).count()).toBe(1);
		expect(await f.page.getByRole("textbox", { name: "title", exact: true }).count()).toBe(0);
	} else {
		const response = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
		expect(await (await response).json()).toMatchObject({ ok: false });
		expect(await f.target.getAttribute("contenteditable")).toBe(null);
	}
	expect(f.writes).toEqual([]);
	expect(f.bytes()).toEqual(files);
	expect(await shape(f.frame)).toEqual(await shape(normal));
});

it.each(["remount", "copied DOM stamp", "reused host changed call"] as const)(
	"retires an open native source intent after %s",
	{ timeout: 120000 },
	async (kind) => {
		const body =
			kind === "reused host changed call"
				? '{changed?<Label label="Same"/>:<Label label="Same"/>}'
				: '<Label key={changed?"new":"old"} label="Same"/>';
		const source = `import {useState} from 'react';function Label({label}){return <span id="label">{label}</span>}export default function Example(){const[changed,setChanged]=useState(false);globalThis.change=()=>setChanged(value=>!value);return <main style={{padding:40}}>${body}<output>{String(changed)}</output><input id="draft" defaultValue="Native"/></main>}`;
		const files = { "shared/composition.tsx": source };
		const f = await originCanvas(files, frameSource, "#label");
		const normal = await originOracle(f, files, "shared/composition.tsx");
		await f.edit();
		await f.target.evaluate((el) => Reflect.set(globalThis, "originalHost", el));
		await f.page.route("**/source", async (route) => {
			if (route.request().postDataJSON()?.action !== "commit") return route.continue();
			for (const app of [f.frame, normal]) {
				if (kind === "copied DOM stamp")
					await app.locator("#label").evaluate((el) => el.replaceWith(el.cloneNode(true)));
				else {
					await app.locator("#draft").evaluate(() => Reflect.get(globalThis, "change")());
					await expect.poll(() => app.locator("output").textContent()).toBe("true");
				}
			}
			expect(await f.target.evaluate((el) => el === Reflect.get(globalThis, "originalHost"))).toBe(
				kind === "reused host changed call",
			);
			await route.continue();
		});
		const result = f.page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "commit",
		);
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("Must not save");
		await f.page.keyboard.press("Enter");
		expect(await (await result).json()).toMatchObject({ ok: false });
		expect(f.bytes()).toEqual(files);
		expect(f.writes).toEqual(["commit"]);
		expect(await f.frame.locator("output").textContent()).toBe(await normal.locator("output").textContent());
	},
);

it("discloses a repeated literal definition without treating generated labels as individual source owners", {
	timeout: 120000,
}, async () => {
	const source = `function Row({label}){return <section><span>{label}</span><b>Definition</b></section>}export default function Example(){return <main style={{padding:40}}>{['Alpha','Beta'].map(label=><Row key={label} label={label}/>)}</main>}`;
	const files = { "shared/composition.tsx": source };
	const f = await originCanvas(files, frameSource, "b", true);
	const second = f.page.frameLocator('iframe[title="second"]');
	const normal = await originOracle(
		f,
		{
			"shared/composition.tsx": `let words="Definition";globalThis.setWords=value=>words=value;${source.replace(">Definition<", ">{words}<")}`,
		},
		"shared/composition.tsx",
	);
	await f.select();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	await expect.poll(() => f.page.locator("[data-source-uses]").textContent()).toContain("4");
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	const read = await f.edit();
	expect(read.scope).toBe("definition");
	expect(read.repeated).toBe(true);
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Edited");
	await f.page.keyboard.press("Enter");
	for (let phase = 0; phase < 3; phase++) {
		const value = phase === 1 ? "Definition" : "Edited";
		if (phase > 0) await f.history(phase === 2);
		await normal.evaluate((value) => {
			Reflect.get(globalThis, "setWords")(value);
			Reflect.get(globalThis, "oracleRender")();
		}, value);
		await expect
			.poll(() => f.bytes())
			.toEqual({ "shared/composition.tsx": source.replace(">Definition<", `>${value}<`) });
		await f.settled();
		for (const app of [f.frame, second, normal]) {
			await expect.poll(() => app.locator("b").allTextContents()).toEqual([value, value]);
			expect(await app.locator("span").allTextContents()).toEqual(["Alpha", "Beta"]);
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});
