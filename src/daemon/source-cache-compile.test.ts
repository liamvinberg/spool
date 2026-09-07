import { expect, it } from "vitest";
import { installValueFlow } from "../runtime/source-values";
import { lowerLiterals } from "./retained-compile";
import { observeCacheSource } from "./source-cache-compile";

it("keeps original cache locations through literal lowering and leaves unknown carriers untouched", () => {
	const source = `function Label(){return <b>Before</b>}\nfunction Pass({children}){globalThis.saved??=children;return globalThis.saved}`;
	const lowered = lowerLiterals("frame.tsx", source);
	const observed = observeCacheSource("frame.tsx", source, lowered.code);
	expect(observed).toContain('cacheAssign("frame.tsx:2:27","saved",()=>');
	expect(observed).toContain('cacheRead("frame.tsx:2:62","saved",');
	expect(observed).toContain(lowered.code.slice(0, lowered.code.indexOf("function Pass")));
});

it.each([
	"function Pass(globalThis,children){globalThis.saved??=children;return globalThis.saved}",
	"const globalThis={};function Pass(children){globalThis.saved??=children;return globalThis.saved}",
	"function hidden({globalThis}){};function Pass(children){globalThis.saved??=children;return globalThis.saved}",
	"function Pass(children){const alias=globalThis;alias.saved??=children;return alias.saved}",
	"function Pass(children){globalThis.saved??=children;return globalThis.other}",
	"async function Pass(children){globalThis.saved??=children;return globalThis.saved}",
	"function Pass(children){globalThis['saved']??=children;return globalThis['saved']}",
])("does not fabricate cache evidence for shadowed or unproved forms: %s", (source) => {
	expect(observeCacheSource("frame.tsx", source, source)).toBe(source);
});

it.each(["stored", "ignored", "thrown"])("preserves actual accessor execution for %s writes", (mode) => {
	const source = `function Pass(children){globalThis.spoolCacheTest??=children;return globalThis.spoolCacheTest}`;
	const run = (observed: boolean) => {
		installValueFlow({});
		let saved: unknown;
		const order: string[] = [];
		Object.defineProperty(globalThis, "spoolCacheTest", {
			configurable: true,
			get() {
				order.push("get");
				return saved;
			},
			set(value) {
				order.push("set");
				if (mode === "thrown") throw new Error("denied");
				if (mode === "stored") saved = value;
			},
		});
		try {
			const pass = Function(`${observed ? observeCacheSource("frame.tsx", source, source) : source};return Pass;`)();
			const value = {};
			const results: unknown[] = [];
			for (let i = 0; i < 2; i++) {
				try {
					results.push(pass(value) === value ? "same object" : "not stored");
				} catch (error) {
					results.push(error instanceof Error ? error.message : "unknown");
				}
			}
			return { results, order, events: globalThis.__SPOOL_VALUES__!.cacheEvents() };
		} finally {
			Reflect.deleteProperty(globalThis, "spoolCacheTest");
		}
	};
	const ordinary = run(false),
		observed = run(true);
	expect(observed.results).toEqual(ordinary.results);
	expect(observed.order).toEqual(ordinary.order);
	expect(observed.events.filter((event) => event.kind === "read")).toHaveLength(mode === "thrown" ? 0 : 2);
	if (mode === "ignored")
		expect(
			observed.events
				.filter((event) => event.kind === "read")
				.every((event) => event.matchingAssignment === undefined),
		).toBe(true);
});
