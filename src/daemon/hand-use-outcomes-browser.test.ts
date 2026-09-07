import { expect, it } from "vitest";
import type { SourcePublication, SourceRead, SourceResult, UseOutcome } from "../source-edit";
import { originCanvas, originOracle } from "./hand-origin-browser-helpers";

const frameSource = 'import Group from "shared/outcomes";export default function Frame(){return <Group/>}';
const state = "const[n,setN]=useState(0);globalThis.bump=()=>setN(n+1);";
function group(body = "return <span>{label}</span>", definitions = "", comparator = "()=>false", caught = false) {
	return `import {Component,memo,Suspense,useState} from 'react';${definitions};class Boundary extends Component{state={failed:false};static getDerivedStateFromError(){return {failed:true}}componentDidCatch(){globalThis.caught=(globalThis.caught??0)+1}render(){return this.state.failed?<b>Failed</b>:this.props.children}};const Leaf=memo(function Leaf({label,hold}){${body}},${comparator});function Wrapper({hold}){return <Leaf hold={hold} label="Before"/>}export default function Group(){${state}return <main style={{padding:40}}><div id="good"><Wrapper hold={false}/></div><div id="special">${caught ? "<Boundary>" : ""}<Suspense fallback={<i>Waiting</i>}><Wrapper hold={true}/></Suspense>${caught ? "</Boundary>" : ""}</div><output>{n}</output><input id="draft" defaultValue="Native"/></main>}`;
}
const gate = `let ready=false;let failed=false;let resolve;let gate=new Promise(r=>resolve=r);globalThis.finish=()=>{ready=true;resolve()};globalThis.fail=()=>{failed=true;resolve()};globalThis.resetGate=()=>{ready=false;failed=false;gate=new Promise(r=>resolve=r)}`;
const waiting = `if(hold&&label==='After'&&failed)throw Error('authored failure');if(hold&&label==='After'&&!ready)throw gate;return <span>{label}</span>`;
function changed(source: string, value: string) {
	return source.replace('label="Before"', `label="${value}"`);
}
function ordinary(source: string) {
	return `let words="Before";globalThis.changeWords=value=>words=value;${source.replace('label="Before"', "label={words}")}`;
}
type Evidence = { frame: string; data: { spool: string; result?: UseOutcome; [key: string]: unknown } };
async function observed(
	source: string,
	fault?: "counterfeit" | "empty-targets" | "absence",
	extra: Record<string, string> = {},
) {
	const files = { "shared/outcomes.tsx": source, ...extra };
	const f = await originCanvas(files, frameSource, "#good span", true, async (page) => {
		await page.addInitScript((fault) => {
			const events: unknown[] = [];
			Reflect.set(window, "outcomeEvents", events);
			addEventListener(
				"message",
				(event) => {
					const data = event.data;
					if (
						data?.spool === "source-request" &&
						data.action === "install" &&
						location.pathname.includes("second")
					) {
						// Deliberate transport corruption after the real owner/current/admission
						// decisions. The source receipt and separately minted expectation stay intact.
						const publication = data.publication as SourcePublication;
						if (fault === "counterfeit")
							publication.packet.values[publication.cell ?? publication.original.cell] = "Counterfeit";
						if (fault === "empty-targets") publication.targets = [];
						if (fault === "absence") {
							for (const fields of Object.values(publication.packet.attributes ?? {}))
								for (const definition of Object.values(fields))
									if (definition.cell === (publication.cell ?? publication.original.cell))
										definition.absent = !definition.absent;
						}
					}
					if (
						typeof data?.spool === "string" &&
						data.spool.startsWith("source-") &&
						data.spool !== "source-request"
					) {
						const iframe = Array.from(document.querySelectorAll("iframe")).find(
							(frame) => frame.contentWindow === event.source,
						);
						events.push({ frame: iframe?.title ?? "", data });
					}
				},
				true,
			);
		}, fault);
	});
	const second = f.page.frameLocator('iframe[title="second"]');
	await expect.poll(() => second.locator("#good span").count()).toBe(1);
	const sourceResults: SourceResult[] = [];
	const sourceReads: SourceRead[] = [];
	f.page.on("response", async (response) => {
		if (
			response.url().endsWith("/source") &&
			["commit", "inverse"].includes(response.request().postDataJSON()?.action)
		)
			sourceResults.push((await response.json()) as SourceResult);
	});
	const initial = async () => {
		await expect
			.poll(
				async () =>
					(await events()).filter(
						(event) => event.data.spool === "source-reply" && event.data.result?.installation,
					).length,
				{
					timeout: 15_000,
				},
			)
			.toBe(2);
		return (await events())
			.filter((event) => event.data.spool === "source-reply" && event.data.result?.installation)
			.map((event) => ({ frame: event.frame, result: event.data.result! }));
	};
	const events = async () => f.page.evaluate(() => Reflect.get(window, "outcomeEvents")) as Promise<Evidence[]>;
	const save = async () => {
		sourceReads.push(await f.edit());
		await f.page.keyboard.press("ControlOrMeta+a");
		await f.page.keyboard.insertText("After");
		await f.page.keyboard.press("Enter");
		await expect.poll(() => f.bytes()["shared/outcomes.tsx"], { timeout: 15_000 }).toBe(changed(source, "After"));
		return initial();
	};
	return { ...f, second, sourceResults, sourceReads, events, save, source };
}
async function warm(f: Awaited<ReturnType<typeof observed>>) {
	for (const app of [f.frame, f.second]) {
		await app.locator("#draft").fill("Typed independent");
		await app.locator("#draft").evaluate((el) => {
			Reflect.set(window, "originalInput", el);
			Reflect.get(globalThis, "bump")();
		});
		await expect.poll(() => app.locator("output").textContent()).toBe("1");
	}
}
async function oracle(f: Awaited<ReturnType<typeof observed>>) {
	const source = ordinary(f.source);
	const page = await originOracle(f, { "shared/outcomes.tsx": source }, "shared/outcomes.tsx");
	await page.locator("#draft").fill("Typed independent");
	await page.locator("#draft").evaluate(() => Reflect.get(globalThis, "bump")());
	return page;
}

it("keeps verified and memo-mismatching uses independent within both mounted frames", {
	timeout: 120_000,
}, async () => {
	const f = await observed(group(undefined, "", "previous=>previous.hold"));
	await warm(f);
	const normal = await oracle(f);
	const results = await f.save();
	for (const item of results) {
		expect(item.result.rendered).toBe("mismatching");
		expect(item.result.uses?.map((use) => use.rendered).sort()).toEqual(["mismatching", "verified"]);
	}
	await expect.poll(() => f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(1);
	for (let phase = 0; phase < 3; phase++) {
		const value = phase === 1 ? "Before" : "After";
		if (phase > 0) await f.history(phase === 2);
		await normal.evaluate((value) => {
			Reflect.get(globalThis, "changeWords")(value);
			Reflect.get(globalThis, "oracleRender")();
		}, value);
		await expect.poll(() => f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, value));
		await f.settled();
		for (const app of [f.frame, f.second, normal]) {
			expect(await app.locator("#good span").textContent()).toBe(value);
			expect(await app.locator("#special span").textContent()).toBe("Before");
			expect(await app.locator("#draft").inputValue()).toBe("Typed independent");
			expect(await app.locator("output").textContent()).toBe("1");
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it.each(["finish", "fail"] as const)(
	"reports independent pending uses then authored %s without a second save",
	{ timeout: 120_000 },
	async (ending) => {
		const f = await observed(group(waiting, gate));
		await warm(f);
		const normal = await oracle(f);
		const errors: string[] = [];
		normal.on("pageerror", (error) => errors.push(error.message));
		const results = await f.save();
		for (const item of results) {
			expect(item.result.rendered).toBe("pending");
			expect(item.result.uses?.map((use) => use.rendered).sort()).toEqual(["pending", "verified"]);
		}
		await normal.evaluate(() => {
			Reflect.get(globalThis, "changeWords")("After");
			Reflect.get(globalThis, "oracleRender")();
		});
		for (const app of [f.frame, f.second, normal]) {
			await expect.poll(() => app.locator("i").textContent()).toBe("Waiting");
			expect(await app.locator("#good span").textContent()).toBe("After");
		}
		await expect.poll(() => f.page.locator('[data-hand-notice="pending"]').count()).toBe(1);
		// One window resolves successfully while the other independently finishes/fails.
		await f.frame.locator("#draft").evaluate(() => Reflect.get(globalThis, "finish")());
		await f.second.locator("#draft").evaluate((_element, ending) => Reflect.get(globalThis, ending)(), ending);
		await normal.evaluate((ending) => Reflect.get(globalThis, ending)(), ending);
		await expect.poll(() => f.frame.locator("#special span").textContent()).toBe("After");
		if (ending === "finish") {
			await expect.poll(() => f.second.locator("#special span").textContent()).toBe("After");
			await expect.poll(() => normal.locator("#special span").textContent()).toBe("After");
			await expect.poll(() => f.page.locator('[data-hand-notice="pending"]').count(), { timeout: 15_000 }).toBe(0);
		} else {
			await expect.poll(() => errors.length).toBeGreaterThan(0);
			await expect.poll(() => f.second.locator("#good span").count()).toBe(0);
			await expect.poll(() => f.page.locator('[data-hand-notice="failed"]').count(), { timeout: 15_000 }).toBe(1);
		}
		await expect
			.poll(async () => (await f.events()).filter((event) => event.data.spool === "source-outcome").length, {
				timeout: 15000,
			})
			.toBeGreaterThanOrEqual(2);
		const late = (await f.events()).filter((event) => event.data.spool === "source-outcome");
		for (const frame of ["home", "second"]) {
			const event = late.filter((event) => event.frame === frame).at(-1);
			expect(event?.data.result?.rendered).toBe(frame === "second" && ending === "fail" ? "failed" : "verified");
			const receipt = f.sourceResults[0];
			expect(receipt?.ok).toBe(true);
			if (receipt?.ok && receipt.publication) {
				const accepted = [receipt.publication, ...(receipt.publication.related ?? [])].find(
					(publication) => publication.frame === frame,
				);
				expect(accepted).toBeDefined();
				expect(event?.data).toMatchObject({
					publication: accepted?.packet.id,
					owner: accepted?.owner,
					generation: accepted?.generation,
				});
				if (frame === "second" && ending === "fail") {
					expect(event?.data.result?.uses?.some((use) => use.rendered === "failed")).toBe(true);
					expect(event?.data.result?.uses?.some((use) => use.rendered === "verified")).toBe(false);
				} else expect(event?.data.result?.uses?.map((use) => use.rendered)).toEqual(["verified", "verified"]);
			}
		}
		expect(f.writes).toEqual(["commit"]);
		expect(f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, "After"));
		for (const redo of [false, true]) {
			await f.history(redo);
			await expect.poll(() => f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, redo ? "After" : "Before"));
			await expect.poll(() => f.frame.locator("#good span").textContent()).toBe(redo ? "After" : "Before");
			if (ending === "finish") {
				await f.settled();
				expect(await f.second.locator("#draft").inputValue()).toBe("Typed independent");
			} else {
				await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
				expect(await f.second.locator("#good span").count()).toBe(0);
			}
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);

it.each(["counterfeit", "empty-targets"] as const)(
	"does not verify %s transport even when another mounted frame is correct",
	{ timeout: 120_000 },
	async (fault) => {
		const f = await observed(group(), fault);
		await warm(f);
		const results = await f.save();
		const correct = results.find((item) => item.frame === "home"),
			corrupt = results.find((item) => item.frame === "second");
		expect(correct?.result.rendered).toBe("verified");
		expect(corrupt?.result.rendered).toBe(fault === "counterfeit" ? "mismatching" : "unverified");
		expect(await f.frame.locator("#good span").textContent()).toBe("After");
		expect(await f.second.locator("#good span").textContent()).toBe(
			fault === "counterfeit" ? "Counterfeit" : "After",
		);
		expect(f.sourceResults[0]).toMatchObject({
			ok: true,
			publication: { expected: { value: "After", absent: false } },
		});
		expect(f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, "After"));
		await expect
			.poll(() =>
				f.page.locator(`[data-hand-notice="${fault === "counterfeit" ? "mismatching" : "unverified"}"]`).count(),
			)
			.toBe(1);
		for (const redo of [false, true]) {
			await f.history(redo);
			await expect.poll(() => f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, redo ? "After" : "Before"));
			await f.settled();
			expect(await f.frame.locator("#good span").textContent()).toBe(redo ? "After" : "Before");
			expect(await f.second.locator("#good span").textContent()).toBe(
				fault === "counterfeit" ? "Counterfeit" : redo ? "After" : "Before",
			);
			expect(f.sourceResults.at(-1)).toMatchObject({
				ok: true,
				publication: { expected: { value: redo ? "After" : "Before", absent: false } },
			});
			expect(
				await f.page
					.locator(`[data-hand-notice="${fault === "counterfeit" ? "mismatching" : "unverified"}"]`)
					.count(),
			).toBe(1);
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);

it.each(["absent", "empty", "existing", "counterfeit"] as const)(
	"uses owner-authored attribute expectations and restores %s precisely",
	{ timeout: 120_000 },
	async (mode) => {
		const before = mode === "absent" ? null : mode === "empty" ? "" : "Before";
		const attribute = before === null ? "" : ` title="${before}"`;
		const source = `import {useState} from 'react';export default function Group(){${state}return <main style={{padding:40}}><div id="good"><span${attribute}>Words</span></div><output>{n}</output><input id="draft" defaultValue="Native"/></main>}`;
		const f = await observed(source, mode === "counterfeit" ? "counterfeit" : undefined);
		await warm(f);
		await f.select();
		const title = f.page.getByRole("textbox", { name: "title", exact: true });
		await expect.poll(() => title.count()).toBe(1);
		await title.fill("After");
		await title.press("Enter");
		const after = source.replace(`<span${attribute}>`, '<span title="After">');
		for (let phase = 0; phase < 3; phase++) {
			if (phase > 0) await f.history(phase === 2);
			await expect
				.poll(() => f.bytes()["shared/outcomes.tsx"], { timeout: 15_000 })
				.toBe(phase === 1 ? source : after);
			await f.settled();
			expect(f.sourceResults[phase]).toMatchObject({
				ok: true,
				publication: {
					expected: { value: phase === 1 ? (before ?? "") : "After", absent: phase === 1 && before === null },
				},
			});
			expect(await f.frame.locator("#good span").getAttribute("title")).toBe(phase === 1 ? before : "After");
			expect(await f.second.locator("#good span").getAttribute("title")).toBe(
				mode === "counterfeit" ? "Counterfeit" : phase === 1 ? before : "After",
			);
			for (const app of [f.frame, f.second]) {
				expect(await app.locator("#good span").textContent()).toBe("Words");
				expect(await app.locator("#draft").inputValue()).toBe("Typed independent");
			}
			if (mode === "counterfeit")
				await expect.poll(() => f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(1);
		}
		expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
	},
);

it("opens a cold dependent use from saved source without claiming prior visible verification", {
	timeout: 120_000,
}, async () => {
	const f = await observed(group(), undefined, {
		"frames/cold-page/cold/frame.tsx": frameSource,
	});
	await f.select();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	await expect
		.poll(() => f.page.locator("[data-source-uses]").textContent())
		.toContain("1 unmounted source-dependent frame");
	expect(await f.page.locator('iframe[title="cold"]').count()).toBe(0);
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	const installed = await f.save();
	expect(installed.map((item) => item.frame).sort()).toEqual(["home", "second"]);
	expect(installed.every((item) => item.result.rendered === "verified")).toBe(true);
	await f.select();
	await f.page.getByRole("button", { name: "Show affected uses", exact: true }).click();
	await f.page.locator("[data-source-uses]").getByRole("button", { name: "cold not mounted ↗", exact: true }).click();
	const cold = f.page.frameLocator('iframe[title="cold"]');
	await expect.poll(() => cold.locator("#good span").textContent()).toBe("After");
	expect((await f.events()).filter((event) => event.data.result?.installation && event.frame === "cold")).toEqual([]);
	for (const redo of [false, true]) {
		await f.history(redo);
		await expect.poll(() => cold.locator("#good span").textContent()).toBe(redo ? "After" : "Before");
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
	}
});

it("keeps an independently failed frame from borrowing a successful sibling's verification", {
	timeout: 120_000,
}, async () => {
	const fail = `if(hold&&failedFrame&&label==='After')throw Error('authored failed sibling');return <span>{label}</span>`;
	const f = await observed(group(fail, "const failedFrame=location.pathname.includes('second');"));
	await warm(f);
	const normal = await oracle(f);
	const failedOracle = await originOracle(
		f,
		{
			"shared/outcomes.tsx": ordinary(f.source.replace("location.pathname.includes('second')", "true")),
		},
		"shared/outcomes.tsx",
	);
	const errors: string[] = [];
	failedOracle.on("pageerror", (error) => errors.push(error.message));
	const results = await f.save();
	expect(results.find((item) => item.frame === "home")?.result.uses?.every((use) => use.rendered === "verified")).toBe(
		true,
	);
	expect(results.find((item) => item.frame === "second")?.result.rendered).toBe("failed");
	await normal.evaluate(() => {
		Reflect.get(globalThis, "changeWords")("After");
		Reflect.get(globalThis, "oracleRender")();
	});
	await failedOracle.evaluate(() => {
		Reflect.get(globalThis, "changeWords")("After");
		Reflect.get(globalThis, "oracleRender")();
	});
	await expect.poll(() => errors.length).toBeGreaterThan(0);
	expect(await normal.locator("#good span").textContent()).toBe("After");
	expect(await f.frame.locator("#good span").textContent()).toBe("After");
	expect(await f.second.locator("#good span").count()).toBe(0);
	await expect.poll(() => f.page.locator('[data-hand-notice="failed"]').count()).toBe(1);
	expect(f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, "After"));
	for (const redo of [false, true]) {
		await f.history(redo);
		await expect.poll(() => f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, redo ? "After" : "Before"));
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		await expect.poll(() => f.frame.locator("#good span").textContent()).toBe(redo ? "After" : "Before");
		expect(await f.second.locator("#good span").count()).toBe(0);
		const latest = (await f.events())
			.filter(
				(event) =>
					event.frame === "second" && event.data.spool === "source-reply" && event.data.result?.installation,
			)
			.at(-1);
		expect(latest?.data.result?.rendered).not.toBe("verified");
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("distinguishes saved empty attributes from missing attributes across corrupted save and inverse", {
	timeout: 120_000,
}, async () => {
	const source = `import {useState} from 'react';export default function Group(){${state}return <main style={{padding:40}}><div id="good"><span>Words</span></div><output>{n}</output><input id="draft" defaultValue="Native"/></main>}`;
	const f = await observed(source, "absence");
	await warm(f);
	await f.select();
	const title = f.page.getByRole("textbox", { name: "title", exact: true });
	await title.fill("Temporary");
	await title.fill("");
	await title.press("Enter");
	const after = source.replace("<span>", '<span title="">');
	for (let phase = 0; phase < 3; phase++) {
		if (phase > 0) await f.history(phase === 2);
		await expect.poll(() => f.bytes()["shared/outcomes.tsx"], { timeout: 15000 }).toBe(phase === 1 ? source : after);
		await f.settled();
		expect(f.sourceResults[phase]).toMatchObject({
			ok: true,
			publication: { expected: { value: "", absent: phase === 1 } },
		});
		expect(await f.frame.locator("#good span").getAttribute("title")).toBe(phase === 1 ? null : "");
		expect(await f.second.locator("#good span").getAttribute("title")).toBe(phase === 1 ? "" : null);
		await expect.poll(() => f.page.locator('[data-hand-notice="mismatching"]').count()).toBe(1);
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("does not let a real older completion erase the latest pending publication", { timeout: 120_000 }, async () => {
	const f = await observed(group(waiting, gate));
	await f.save();
	for (const app of [f.frame, f.second])
		await app.locator("#draft").evaluate(() => Reflect.get(globalThis, "finish")());
	await expect
		.poll(
			async () =>
				(await f.events()).filter(
					(event) => event.data.spool === "source-outcome" && event.data.result?.rendered === "verified",
				).length,
			{ timeout: 15000 },
		)
		.toBeGreaterThanOrEqual(2);
	const old = (await f.events()).find(
		(event) =>
			event.frame === "home" && event.data.spool === "source-outcome" && event.data.result?.rendered === "verified",
	);
	expect(old).toBeDefined();
	await f.history();
	await f.settled();
	await expect.poll(() => f.frame.locator("#special span").textContent()).toBe("Before");
	await f.frame.locator("#draft").evaluate(() => Reflect.get(globalThis, "resetGate")());
	await f.history(true);
	await f.settled();
	await expect.poll(() => f.frame.locator("i").textContent()).toBe("Waiting");
	await expect.poll(() => f.page.locator('[data-hand-notice="pending"]').count()).toBe(1);
	// Replay unchanged evidence through its actual originating window. It belongs
	// to the older saved intent and cannot settle the newer pending redo.
	await f.frame.locator("#draft").evaluate((_element, data) => parent.postMessage(data, "*"), old?.data);
	await f.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	expect(await f.page.locator('[data-hand-notice="pending"]').count()).toBe(1);
	await f.frame.locator("#draft").evaluate(() => Reflect.get(globalThis, "finish")());
	await expect.poll(() => f.page.locator('[data-hand-notice="pending"]').count(), { timeout: 15000 }).toBe(0);
	const latest = (await f.events())
		.filter((event) => event.frame === "home" && event.data.spool === "source-outcome")
		.at(-1);
	expect(latest?.data.result?.rendered).toBe("verified");
	expect(latest?.data.publication).not.toBe(old?.data.publication);
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});

it("does not conceal unknown class-boundary coverage behind its verified sibling", { timeout: 120_000 }, async () => {
	const body = "if(hold&&label==='After')throw Error('authored caught failure');return <span>{label}</span>";
	const f = await observed(group(body, "", undefined, true));
	await warm(f);
	const normal = await oracle(f);
	const results = await f.save();
	await normal.evaluate(() => {
		Reflect.get(globalThis, "changeWords")("After");
		Reflect.get(globalThis, "oracleRender")();
	});
	await expect.poll(() => normal.evaluate(() => Reflect.get(globalThis, "caught"))).toBe(1);
	for (const app of [f.frame, f.second, normal]) {
		expect(await app.locator("#good span").textContent()).toBe("After");
		expect(await app.locator("#special b").textContent()).toBe("Failed");
		expect(await app.locator("#draft").inputValue()).toBe("Typed independent");
	}
	expect(f.sourceReads[0]?.reach?.unknown.length).toBeGreaterThan(0);
	expect(results.every((item) => item.result.uses?.some((use) => use.rendered === "verified"))).toBe(true);
	await expect.poll(() => f.page.locator('[data-hand-notice="unverified"]').count()).toBe(1);
	for (const redo of [false, true]) {
		await f.history(redo);
		await expect.poll(() => f.bytes()["shared/outcomes.tsx"]).toBe(changed(f.source, redo ? "After" : "Before"));
		await expect.poll(() => f.page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		for (const app of [f.frame, f.second]) {
			await expect.poll(() => app.locator("#good span").textContent()).toBe(redo ? "After" : "Before");
			expect(await app.locator("#special b").textContent()).toBe("Failed");
		}
	}
	expect(f.writes).toEqual(["commit", "inverse", "inverse"]);
});
