// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { RungRead } from "../api";
import { type Held, type PropertiesActs, PropertiesRail } from "./properties-rail";
import type { PickedHit } from "./protocol";

/**
 * What the rail says about what the canvas holds (#338).
 *
 * A frame is its own geometry, and an element is the frame it is in plus the
 * crumbs that say where in it: nothing about the element itself is set here.
 */

const GEOMETRY = { x: 40, y: 80, w: 640, h: 480 };

function hit(selector: string, tag: string): PickedHit {
	return {
		selector,
		tag,
		outerHtml: `<${tag}>`,
		rect: { x: 0, y: 0, w: 100, h: 20 },
		radius: 0,
		source: `frames/cart/frame.tsx:${selector.length}:3`,
		generated: false,
	};
}

async function mount(held: Held, rungs: (RungRead | undefined)[] | null = null) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const acts: PropertiesActs = {
		onRung: vi.fn(),
		onGeometry: vi.fn(),
		onGeometryPreview: vi.fn(),
		onGeometryCommit: vi.fn(),
	};
	await act(() => root.render(createElement(PropertiesRail, { held, rungs, acts, width: 300, onCollapse: () => {} })));
	onTestFinished(async () => {
		await act(() => root.unmount());
		host.remove();
	});
	return { host, acts };
}

const rows = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLElement>("[data-properties-row]")].map((row) => row.dataset.propertiesRow);

it("shows a held element's frame geometry and the crumbs, and nothing about the element", async () => {
	const chain = [hit("main", "main"), hit("main > h1", "h1")];
	const { host, acts } = await mount(
		{ kind: "element", frame: "cart", geometry: GEOMETRY, chain, selector: "main > h1" },
		[
			{ source: "frames/cart/frame.tsx:4:3", name: "main" },
			{ source: "frames/cart/frame.tsx:9:3", name: "Heading" },
		],
	);
	expect(rows(host)).toEqual(["x", "y", "w", "h"]);
	expect(host.querySelector<HTMLInputElement>('[data-properties-row="w"] input')?.value).toBe("640");
	// the crumbs say the names the author wrote, the frame at the root
	expect(host.querySelector("[data-properties-crumbs]")?.textContent).toContain("Heading");
	expect(host.querySelector("[data-properties-crumbs]")?.textContent).toContain("cart");

	// a field writes the frame's own geometry, which is frame.json
	const field = host.querySelector<HTMLInputElement>('[data-properties-row="w"] input');
	if (field === null) throw new Error("no width field");
	await act(() => {
		field.focus();
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "720");
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
	expect(acts.onGeometry).toHaveBeenCalledExactlyOnceWith("cart", { w: 720 });
});

it("shows the same frame fields for several elements in one frame", async () => {
	const picks = [hit("main > h1", "h1"), hit("main > p", "p")];
	const { host } = await mount({ kind: "elements", count: 2, frame: "cart", geometry: GEOMETRY, picks });
	expect(rows(host)).toEqual(["x", "y", "w", "h"]);
});

it("says how many elements are held when they are spread over frames", async () => {
	const { host } = await mount({ kind: "elements", count: 3, frame: null, geometry: null, picks: [] });
	expect(rows(host)).toEqual([]);
	expect(host.textContent).toContain("3 elements");
});
