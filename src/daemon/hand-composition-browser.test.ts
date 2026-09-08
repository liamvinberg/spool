import { expect, it } from "vitest";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const frameSource = 'import Example from "shared/composition";export default function Frame(){return <Example/>}';
const syntax = [
	{
		name: "anonymous default function",
		definition: "export default function({label}){return <button>{label}</button>}",
		importer: 'import Button from "shared/leaf";',
	},
	{
		name: "anonymous default arrow",
		definition: "export default ({label})=><button>{label}</button>",
		importer: 'import Button from "shared/leaf";',
	},
	{
		name: "immutable local component alias",
		definition: "const Original=({label})=><button>{label}</button>;const Button=Original;export {Button};",
		importer: 'import {Button} from "shared/leaf";',
	},
	{
		name: "direct props member",
		definition: "export const Button=props=><button>{props.label}</button>",
		importer: 'import {Button} from "shared/leaf";',
	},
	{
		name: "renamed destructured parameter",
		definition: "export const Button=({label:words})=><button>{words}</button>",
		importer: 'import {Button} from "shared/leaf";',
	},
	{
		name: "function expression through explicit re-export",
		definition: "const Original=function({label}){return <button>{label}</button>};export {Original as Renamed};",
		importer: 'import {Choice as Button} from "shared/barrel";',
		barrel: 'export {Renamed as Choice} from "./leaf";',
	},
];
it.each(syntax)("retains supported $name through real source save and inverse", { timeout: 120000 }, async (sample) => {
	const source = `import {useState} from 'react';${sample.importer}export default function Example(){const[n,setN]=useState(0);globalThis.bump=()=>setN(n+1);return <main style={{padding:40}}><Button label="Before"/><Button label="Before"/><output>{n}</output><input id="draft" defaultValue="Native"/></main>}`;
	const files: Record<string, string> = { "shared/leaf.tsx": sample.definition, "shared/composition.tsx": source };
	if (sample.barrel) files["shared/barrel.ts"] = sample.barrel;
	const f = await originCanvas(files, frameSource, "button", true);
	const second = f.page.frameLocator('iframe[title="second"]');
	const normal = await originOracle(
		f,
		{
			...files,
			"shared/composition.tsx": `let words="Before";globalThis.setWords=value=>words=value;${source.replace('label="Before"', "label={words}")}`,
		},
		"shared/composition.tsx",
	);
	for (const app of [f.frame, second, normal]) {
		await app.locator("#draft").fill("Typed");
		await app.locator("#draft").evaluate((el) => {
			Reflect.set(globalThis, "initialInput", el);
			Reflect.get(globalThis, "bump")();
		});
		await expect.poll(() => app.locator("output").textContent()).toBe("1");
	}
	const read = await f.edit();
	expect(read.scope).toBe("call-site");
	expect(read.field).toBe("label");
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("After");
	await f.page.keyboard.press("Enter");
	for (let phase = 0; phase < 3; phase++) {
		const value = phase === 1 ? "Before" : "After";
		if (phase > 0) await f.history(phase === 2);
		await normal.evaluate((value) => {
			Reflect.get(globalThis, "setWords")(value);
			Reflect.get(globalThis, "oracleRender")();
		}, value);
		await expect
			.poll(() => f.bytes(), { timeout: 15000 })
			.toEqual({ ...files, "shared/composition.tsx": source.replace('label="Before"', `label="${value}"`) });
		await f.settled();
		for (const app of [f.frame, second, normal]) {
			await expect.poll(() => app.locator("button").allTextContents()).toEqual([value, "Before"]);
			expect(await app.locator("#draft").inputValue()).toBe("Typed");
			expect(await app.locator("#draft").evaluate((el) => el === Reflect.get(globalThis, "initialInput"))).toBe(
				true,
			);
			expect(await app.locator("output").textContent()).toBe("1");
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("preserves compound ordinary React behavior around a retained source edit", { timeout: 120000 }, async () => {
	const source = `import {Component,Suspense,cloneElement,createContext,forwardRef,lazy,memo,startTransition,useContext,useEffect,useRef,useState} from 'react';import {createPortal} from 'react-dom';
const portal=document.createElement('aside');portal.id='portal';document.body.append(portal);
const Context=createContext('default');function Plain({label,ref}){return <button ref={ref}>{label}</button>}
const Arrow=({label:text})=><button>{text}</button>;const Memo=memo(Plain);const Forward=forwardRef(({label},ref)=><button ref={ref}>{label}</button>);
class ClassButton extends Component{render(){return <button>Class</button>}}function ContextButton(){const label=useContext(Context);return <button>{label}</button>}
function Pair(){return <><b>One</b><b>Two</b></>}function Nothing(){return null}
function Slot({children}){const copy=cloneElement(children,{label:'Cloned'});globalThis.contract={type:children.type===Plain,copyType:copy.type===Plain,props:Object.keys(children.props).sort(),copyProps:Object.keys(copy.props).sort(),key:children.key,copyKey:copy.key,ref:copy.props.ref===children.props.ref,children:copy.props.children===children.props.children};return copy}
function Pass({children}){return children}
const Lazy=lazy(()=>new Promise(resolve=>{globalThis.resolveLazy=()=>resolve({default:Plain})}));
function Stateful(){const[n,setN]=useState(0);return <button id="state" onClick={()=>startTransition(()=>setN(n+1))}>{n}</button>}
function Editable(){return <h1 id="target">Before</h1>}
export default function Example(){const[tick,setTick]=useState(0);globalThis.bump=()=>setTick(tick+1);const ref=useRef(null),forward=useRef(null),instance=useRef(null),cloned=useRef(null);useEffect(()=>{globalThis.mounts=(globalThis.mounts??0)+1;globalThis.originalInstance=instance.current;globalThis.refs=[ref.current?.tagName,forward.current?.tagName,instance.current instanceof ClassButton,cloned.current?.tagName]},[]);globalThis.sameInstance=()=>instance.current===globalThis.originalInstance;return <main style={{padding:40}}><Editable/><Plain ref={ref} label="Plain"/><Arrow label="Arrow"/><Memo label="Memo"/><Forward ref={forward} label="Forward"/><ClassButton ref={instance}/><Context value="Context"><ContextButton/></Context><Context.Provider value="Provider"><ContextButton/></Context.Provider><Slot><Plain key="stable" ref={cloned} label="Original">Child</Plain></Slot><Pass><Plain label="Passed"/></Pass><Pair/><Nothing/>{createPortal(<Plain label="Portal"/>,portal)}<Suspense fallback={<i>Loading</i>}><Lazy label="Lazy"/></Suspense><Stateful/><output>{tick}</output><input id="draft" defaultValue="Kept"/></main>}`;
	const files = { "shared/composition.tsx": source };
	const f = await originCanvas(files, frameSource, "#target");
	const normal = await originOracle(
		f,
		{
			"shared/composition.tsx": `let words="Before";globalThis.setWords=value=>words=value;${source.replace(">Before<", ">{words}<")}`,
		},
		"shared/composition.tsx",
	);
	const sample = async (app: typeof f.frame | typeof normal) =>
		app.locator("main").evaluate((el) => ({
			labels: Array.from(document.querySelectorAll("button,b,i,h1"), (node) => node.textContent),
			contract: Reflect.get(globalThis, "contract"),
			refs: Reflect.get(globalThis, "refs"),
			mounts: Reflect.get(globalThis, "mounts"),
			instance: Reflect.get(globalThis, "sameInstance")(),
			input: (el.querySelector("input") as HTMLInputElement).value,
			state: el.querySelector("#state")?.textContent,
			tick: el.querySelector("output")?.textContent,
			portal: document.querySelector("#portal")?.textContent,
		}));
	await expect.poll(() => sample(f.frame)).toEqual(await sample(normal));
	for (const app of [f.frame, normal]) {
		await app.locator("#state").evaluate((el) => (el as HTMLButtonElement).click());
		await expect.poll(() => app.locator("#state").textContent()).toBe("1");
		await app.locator("#draft").fill("Typed");
		await app.locator("#draft").evaluate((el) => {
			Reflect.set(globalThis, "initialInput", el);
			Reflect.get(globalThis, "resolveLazy")();
			Reflect.get(globalThis, "bump")();
		});
		await expect.poll(() => app.locator("i").count()).toBe(0);
		expect(
			await app.locator("#draft").evaluate((el) => ({
				focused: document.activeElement === el,
				start: (el as HTMLInputElement).selectionStart,
				end: (el as HTMLInputElement).selectionEnd,
			})),
		).toEqual({ focused: true, start: 5, end: 5 });
	}
	expect(await sample(f.frame)).toEqual(await sample(normal));
	await f.edit();
	await f.page.keyboard.press("ControlOrMeta+a");
	await f.page.keyboard.insertText("After");
	await f.page.keyboard.press("Enter");
	for (let phase = 0; phase < 3; phase++) {
		const value = phase === 1 ? "Before" : "After";
		if (phase > 0) await f.history(phase === 2);
		await normal.evaluate((value) => {
			Reflect.get(globalThis, "setWords")(value);
			Reflect.get(globalThis, "oracleRender")();
		}, value);
		await expect
			.poll(() => f.bytes(), { timeout: 15000 })
			.toEqual({ "shared/composition.tsx": source.replace(">Before<", `>${value}<`) });
		await f.settled();
		await expect.poll(() => f.target.textContent()).toBe(value);
		expect(await sample(f.frame)).toEqual(await sample(normal));
		for (const app of [f.frame, normal]) {
			expect(await app.locator("#draft").evaluate((el) => el === Reflect.get(globalThis, "initialInput"))).toBe(
				true,
			);
			await app.locator("#draft").focus();
			expect(await app.locator("#draft").evaluate((el) => document.activeElement === el)).toBe(true);
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});
