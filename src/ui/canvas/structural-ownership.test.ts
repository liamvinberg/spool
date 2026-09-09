// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { SourceDescription, SourceOperation } from "../../source-edit";
import { type PropertiesActs, PropertiesRail } from "./properties-rail";
import type { PickedHit } from "./protocol";

it("keeps the separately verified Text scope when Delete has a different owner", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("", { status: 404 })),
	);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(async () => {
		await act(async () => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	const hit: PickedHit = {
		selector: "#label",
		tag: "button",
		outerHtml: "<button>Text</button>",
		rect: { x: 0, y: 0, w: 100, h: 30 },
		radius: 0,
		source: "frames/home/frame.tsx:1:1",
		generated: false,
	};
	const original = {
		publication: "original",
		cell: "cell",
		occurrence: "one",
		invocation: "call",
		context: "parent",
		value: "Text",
	};
	const describe = vi.fn(
		async (
			_frame: string,
			_selector: string,
			_field?: string,
			operation: SourceOperation = { kind: "literal" },
		): Promise<SourceDescription> => ({
			operation,
			original,
			source: operation.kind === "delete" ? "shared/part.tsx:1:1" : "frames/home/frame.tsx:1:1",
			role: operation.kind === "delete" ? "structural-unit" : "literal-child",
			scope: operation.kind === "delete" ? "definition" : "call-site",
			value: "Text",
		}),
	);
	const ownership = { describe, release: vi.fn(), highlight: vi.fn(), reveal: vi.fn() };
	const acts: PropertiesActs = {
		ownership,
		text: { begin: async () => undefined, preview: vi.fn(), finish: vi.fn() },
		onRung: vi.fn(),
		onGeometry: vi.fn(),
		onGeometryPreview: vi.fn(),
		onGeometryCommit: vi.fn(),
		onSwap: vi.fn(),
	};
	const render = async (operation?: SourceOperation) => {
		await act(async () =>
			root.render(
				createElement(PropertiesRail, {
					project: "test",
					held: { kind: "element", frame: "home", selector: "#label", chain: [hit] },
					acts: {
						...acts,
						ownership: {
							...ownership,
							...(operation
								? { active: { frame: "home", selector: "#label", generation: 1, field: undefined, operation } }
								: {}),
						},
					},
					revision: 0,
					width: 300,
					onCollapse: vi.fn(),
				}),
			),
		);
	};
	const content = () =>
		[...host.querySelectorAll("span")].find((element) => element.textContent === "Content")?.parentElement
			?.textContent;
	await render();
	expect(content()).toBe("Contentthis use");
	await render({ kind: "delete" });
	expect(describe.mock.lastCall?.[3]).toEqual({ kind: "delete" });
	expect(host.querySelector('[aria-label="Show affected uses"]')?.getAttribute("title")).toBe("shared definition");
	expect(content()).toBe("Contentthis use");
});

it("qualifies the affected count when a use is unknown or unverified", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("", { status: 404 })),
	);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(async () => {
		await act(async () => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	const hit: PickedHit = {
		selector: "#label",
		tag: "button",
		outerHtml: "<button>Text</button>",
		rect: { x: 0, y: 0, w: 100, h: 30 },
		radius: 0,
		source: "frames/home/frame.tsx:1:1",
		generated: false,
	};
	const original = {
		publication: "original",
		cell: "cell",
		occurrence: "one",
		invocation: "call",
		context: "parent",
		value: "Text",
	};
	const use = { frame: "home", original, visible: true };
	const reaches: NonNullable<SourceDescription["reach"]>[] = [
		{ uses: [use, use], unmounted: [], unknown: [] },
		{ uses: [use, use], unmounted: [], unknown: ["second"] },
		{
			uses: [use, use],
			unmounted: [],
			unknown: [],
			unverified: [{ frame: "second", occurrence: "two", installation: "installed", rendered: "unverified" }],
		},
	];
	const badge = () => host.querySelector('[aria-label="Show affected uses"]')?.querySelector("span")?.textContent;
	for (const [index, reach] of reaches.entries()) {
		const describe = vi.fn(
			async (): Promise<SourceDescription> => ({
				operation: { kind: "literal" },
				original,
				source: "shared/part.tsx:1:1",
				role: "literal-child",
				scope: "definition",
				value: "Text",
				reach,
			}),
		);
		const acts: PropertiesActs = {
			ownership: { describe, release: vi.fn(), highlight: vi.fn(), reveal: vi.fn() },
			text: { begin: async () => undefined, preview: vi.fn(), finish: vi.fn() },
			onRung: vi.fn(),
			onGeometry: vi.fn(),
			onGeometryPreview: vi.fn(),
			onGeometryCommit: vi.fn(),
			onSwap: vi.fn(),
		};
		await act(async () =>
			root.render(
				createElement(PropertiesRail, {
					project: "test",
					held: { kind: "element", frame: "home", selector: "#label", chain: [hit] },
					acts,
					revision: index,
					width: 300,
					onCollapse: vi.fn(),
				}),
			),
		);
		// An unverified use is one this count cannot speak for, exactly like an unknown one.
		expect(badge(), String(index)).toBe(index === 0 ? "2" : "2+");
	}
});
