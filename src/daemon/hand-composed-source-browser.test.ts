import { expect, it } from "vitest";
import type { SourceRead } from "../source-edit";
import { originCanvas } from "./hand-origin-browser-helpers";

it.each([
	["direct children", '<Shell><h1 id="subject">Use the agent you already know.</h1></Shell>'],
	["nested children", '<Shell><div><h1 id="subject">Use the agent you already know.</h1></div></Shell>'],
	["sibling children", '<Shell><p>Other</p><div><h1 id="subject">Use the agent you already know.</h1></div></Shell>'],
	["direct named slot", '<Chrome rail={<h1 id="subject">Use the agent you already know.</h1>}/>'],
	["nested named slot", '<Chrome rail={<div><h1 id="subject">Use the agent you already know.</h1></div>}/>'],
	["forwarded named slot", '<Backdrop rail={<h1 id="subject">Use the agent you already know.</h1>}/>'],
	["local panel", "<Chrome rail={rail}/>"],
	["composed panel", "<Backdrop rail={rail}/>"],
	["conditional dock", "<RichBackdrop rail={true ? rail : null}/>"],
	["supplied text in panel", '<Chrome rail={<div><Title label="Use the agent you already know."/></div>}/>'],
])("edits literal text in %s", { timeout: 60_000 }, async (_name, body) => {
	const source = `function Title({label}) {return <h1 id="subject">{label}</h1>}
function Shell({children}) {return <main>{children}</main>}
function Chrome({rail}) {return <aside>{rail}</aside>}
function Dock({lit, children}) {return <aside style={{width:300}}>{lit === null ? null : <div>{children}</div>}<button>Other</button></aside>}
function RichChrome({rail, label='Agent', children}) {const lit=label.toLowerCase();return <div>{children}<Dock lit={lit}>{rail === undefined ? <p>Fallback</p> : rail}</Dock></div>}
function Backdrop({rail}) {return <Shell><Chrome rail={rail}/></Shell>}
function RichBackdrop({rail}) {return <Shell><RichChrome rail={rail}/></Shell>}
export function Stage() {const rail=<div><h1 id="subject">Use the agent you already know.</h1></div>;return ${body}}`;
	const f = await originCanvas(
		{ "shared/stage.tsx": source },
		'import {Stage} from "shared/stage"; export default function Frame(){return <div style={{padding:40}}><Stage/></div>}',
		"#subject",
	);
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("Use your usual agent.");
	await f.page.keyboard.press("Enter");
	await expect.poll(() => f.bytes()["shared/stage.tsx"]).toContain("Use your usual agent.");
	await f.settled();
	await expect.poll(() => f.target.textContent()).toBe("Use your usual agent.");
	await f.history();
	await expect.poll(() => f.bytes()["shared/stage.tsx"]).toBe(source);
	await f.settled();
	await expect.poll(() => f.target.textContent()).toBe("Use the agent you already know.");
	await f.history(true);
	await expect.poll(() => f.bytes()["shared/stage.tsx"]).toContain("Use your usual agent.");
	await f.settled();
	await expect.poll(() => f.target.textContent()).toBe("Use your usual agent.");
});

it("previews, cancels, saves and reverses shared properties inside a composed panel", { timeout: 60_000 }, async () => {
	const source = `function Dock({children}) {return <aside>{children}</aside>}
function Chrome({rail}) {return <Dock>{rail}</Dock>}
export function Stage() {const rail=<div><h1 id="subject" className="w-40 p-4 text-xl">Shared title</h1><input defaultValue="Native"/><p className={['opacity-50'].join(' ')}>Unrelated</p></div>;return <Chrome rail={rail}/>}`;
	const f = await originCanvas(
		{ "shared/stage.tsx": source },
		'import {Stage} from "shared/stage";export default function Frame(){return <main style={{padding:40}}><Stage/></main>}',
		"#subject",
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("input").fill("Keep this draft");
	await f.target.evaluate((element) => Reflect.set(window, "originalSubject", element));
	const width = (frame: typeof f.frame) =>
		frame.locator("#subject").evaluate((element) => getComputedStyle(element).width);
	await f.select();
	const field = f.page.locator('[data-properties-row="width"] input').first();
	const reaching = f.page.waitForResponse(
		(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "reach",
	);
	await field.fill("240px");
	const reached = (await (await reaching).json()) as { ok: boolean; read: SourceRead };
	expect(reached.read.reach?.unknown).toEqual(["home", "second"]);
	expect(reached.read.reach?.uses).toHaveLength(2);
	await expect.poll(() => width(f.frame)).toBe("240px");
	await expect.poll(() => width(second)).toBe("240px");
	expect(f.bytes()["shared/stage.tsx"]).toBe(source);
	await field.press("Escape");
	await expect.poll(() => width(f.frame)).toBe("160px");
	await expect.poll(() => width(second)).toBe("160px");
	expect(f.writes).toEqual([]);
	await field.fill("240px");
	await field.press("Enter");
	await expect.poll(() => f.writes).toEqual(["commit"]);
	await f.settled();
	expect(f.writes).toEqual(["commit"]);
	expect(f.bytes()["shared/stage.tsx"]).toContain("p-4 text-xl");
	await expect.poll(() => width(f.frame)).toBe("240px");
	await expect.poll(() => width(second)).toBe("240px");
	await f.history();
	await expect.poll(() => f.writes).toEqual(["commit", "inverse"]);
	await f.settled();
	expect(f.bytes()["shared/stage.tsx"]).toBe(source);
	await expect.poll(() => width(second)).toBe("160px");
	await f.history(true);
	await expect.poll(() => f.writes).toEqual(["commit", "inverse", "inverse"]);
	await f.settled();
	await expect.poll(() => width(second)).toBe("240px");
	expect(await second.locator("input").inputValue()).toBe("Keep this draft");
	expect(await f.target.evaluate((element) => element === Reflect.get(window, "originalSubject"))).toBe(true);
});

it.each([
	["escaped local panel", "globalThis.saved=rail;", "rail"],
	["mutated local panel", "rail.props.title='Changed';", "rail"],
	["aliased local panel", "const alias=rail;", "alias"],
	["opaque local panel", "const pass=value=>value;", "pass(rail)"],
	["captured local panel", "const later=()=>rail;", "rail"],
])("refuses %s without a source save", { timeout: 60_000 }, async (_name, setup, value) => {
	const source = `function Chrome({rail}) {return <aside>{rail}</aside>}
export function Stage() {const rail=<div><h1 id="subject">Before</h1></div>;${setup}return <Chrome rail={${value}}/>}`;
	const f = await originCanvas(
		{ "shared/stage.tsx": source },
		'import {Stage} from "shared/stage";export default function Frame(){return <main style={{padding:40}}><Stage/></main>}',
		"#subject",
	);
	const box = await f.select();
	await f.page.mouse.click(box.x + 8, box.y + box.height / 2);
	await expect.poll(() => f.page.locator("[data-hand-refusal]").count()).toBe(1);
	expect(f.bytes()["shared/stage.tsx"]).toBe(source);
	expect(f.writes).toEqual([]);
});
