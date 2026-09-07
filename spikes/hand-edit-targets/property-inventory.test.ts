import { writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile } from "../../src/test-helpers";
import { WORDS } from "../../src/ui/canvas/properties-families";
import { ROWS, type Row } from "../../src/ui/canvas/properties-rows";
import { mount, read, select } from "./automatic-browser";
import { literal } from "./automatic-source";

// Exactly the retained rows and bounded pairs used by the inverse inventory.
// Each operation still begins at a mounted selection, never at these tokens.
function samples(row: Row): readonly [string, string] | null {
	const r = row.rule;
	switch (r.kind) {
		case "length":
			return [`${r.family}-${r.unit === "percent" ? 25 : 2}`, `${r.family}-${r.unit === "percent" ? 50 : 4}`];
		case "word": {
			const options = WORDS[r.word].options.map((o) => o.token).filter(Boolean);
			return [options[0] ?? "", options[1] ?? options[0] ?? ""];
		}
		case "colour":
			return [`${r.prefix}-red-500`, `${r.prefix}-blue-500`];
		case "theme": {
			const values: Record<string, readonly [string, string]> = {
				font: ["sans", "serif"],
				text: ["base", "lg"],
				weight: ["normal", "bold"],
				leading: ["normal", "loose"],
				tracking: ["normal", "wide"],
				shadow: ["sm", "md"],
				ease: ["in", "out"],
			};
			const pair = values[r.list];
			return pair ? [`${r.prefix}-${pair[0]}`, `${r.prefix}-${pair[1]}`] : null;
		}
		case "radius": {
			const prefix = r.corner === "all" ? "rounded" : `rounded-${r.corner}`;
			return [`${prefix}-[4px]`, `${prefix}-[8px]`];
		}
		case "border-width": {
			const prefix = r.edge === "all" ? "border" : `border-${r.edge}`;
			return [`${prefix}-2`, `${prefix}-4`];
		}
		case "toggles":
			return [r.set.reset, r.set.groups[0]?.[0] ?? r.set.reset];
		case "gradient":
			return ["bg-linear-to-r from-red-500 to-blue-500", "bg-linear-to-r from-green-500 to-blue-500"];
		case "size-mode":
			return [`${r.axis}-auto`, `${r.axis}-full`];
		case "read":
			return null;
	}
}
let browser: Browser;
const evidence: { status: string; [key: string]: unknown }[] = [];
const roots: string[] = [];
beforeAll(async () => {
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(async () => {
	await browser?.close();
	if (process.env.PROPERTY_READ_EVIDENCE)
		writeFileSync(
			process.env.PROPERTY_READ_EVIDENCE,
			JSON.stringify(
				{ date: new Date().toISOString(), browser: browser.version(), rows: evidence },
				(_key, value: unknown) =>
					typeof value === "string" ? roots.reduce((text, root) => text.replaceAll(root, "<project>"), value) : value,
				2,
			),
		);
});
it("accounts for every retained property through the automatic join with named unsupported outcomes", {
	timeout: 180_000,
}, async () => {
	const root = makeTempDir();
	roots.push(root);
	markProject(root);
	writeDesignFile(root, "shared/tokens.css", ":root {font-size:20px}");
	const cases = ROWS.flatMap((row, index) => {
		const pair = samples(row);
		return pair ? pair.map((classes, stage) => ({ index, row, classes, id: `row-${index}-${stage}` })) : [];
	});
	writeDesignFile(
		root,
		"shared/ui/properties.tsx",
		`export const Properties = () => <main>${cases.map((c) => (c.row.property === "placeholder color" ? `<input id="${c.id}" className="${c.classes}" placeholder="Words"/>` : `<div id="${c.id}" className="${c.classes}">${c.row.property.includes("between children") ? "<span>One</span><span>Two</span>" : "Words"}</div>`)).join("")}</main>`,
	);
	writeDesignFile(
		root,
		"frames/home/frame.tsx",
		`import {Properties as Fields} from 'shared/ui/properties'; export default () => <Fields/>;`,
	);
	const mounted = await mount(browser, root, "home", "observed");
	for (const [index, row] of ROWS.entries()) {
		const pair = samples(row);
		if (!pair) {
			const selection = await select(mounted, "#row-0-0");
			const site = mounted.sources.chain(selection)[0]!;
			evidence.push({
				index,
				property: row.property,
				status: "read-only",
				reason: "no mutation operation",
				selection,
				value: row.property === "className" ? literal(site, "className") : site.source,
			});
			continue;
		}
		const results = [];
		for (let stage = 0; stage < 2; stage++) {
			const result = await read(mounted, await select(mounted, `#row-${index}-${stage}`), {
				kind: "property",
				property: row.property,
				scope: "",
			});
			if (result.kind === "supported") {
				expect(result.target.role).toBe("definition");
				expect(result.target.address.file).toContain("shared/ui/properties.tsx");
				expect(result.target.expected).toBe(pair[stage]);
				expect(result.proof.revisions.some((r) => r.path === "frames/home/frame.tsx")).toBe(true);
				// A nonempty literal which emits no owning declaration is a coverage gap,
				// not a successful absent reading of a known row's own bounded example.
				if (!result.property?.owner)
					results.push({
						kind: "unproven",
						reason: "bounded example has no attributed property declaration",
						result,
					});
				else {
					expect(result.property.owner.value).not.toBe("");
					results.push(result);
				}
			} else results.push(result);
		}
		evidence.push({
			index,
			property: row.property,
			pair,
			status: results.every((r) => r.kind === "supported") ? "supported bounded reads" : "unproven",
			results,
		});
	}
	expect(evidence).toHaveLength(ROWS.length);
	expect(evidence.filter((row) => row.status === "unproven")).toEqual([]);
	await mounted.page.close();
});
