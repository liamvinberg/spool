import { expect, it } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

const owner = "shared/tile.tsx";
const sheet = "shared/tokens.css";
const tokens = "@theme {}\n.tile { padding: 12px }\n@media (min-width: 5000px) { .tile { opacity: 0.25 } }\n";
const carded =
	'export function Tile({label}){return <section data-subject={label} className="tile p-6 opacity-75">{label}</section>}';
const tiles =
	'import {Tile} from "shared/tile";export default function Frame(){return <main><Tile label="A"/><Tile label="B"/></main>}';

it("dbg", { timeout: 120_000 }, async () => {
	const f = await originCanvas({ [owner]: carded, [sheet]: tokens }, tiles, '[data-subject="A"]');
	const bodies: unknown[] = [];
	f.page.on("response", async (response) => {
		if (!response.url().endsWith("/source")) return;
		const request = response.request().postDataJSON();
		if (!["describe", "read", "commit", "preview"].includes(request?.action)) return;
		bodies.push({
			action: request?.action,
			property: request?.operation?.property,
			rules: request?.original?.propertyRules,
			body: await response.json().catch(() => "?"),
		});
	});
	await f.select();
	await f.page.locator('[data-properties-row="padding"] input').first().fill("20");
	await f.page.locator('[data-properties-row="padding"] input').first().press("Enter");
	await f.page.waitForTimeout(4000);
	const { writeFileSync } = await import("node:fs");
	writeFileSync("/tmp/dbg-out.json", JSON.stringify(bodies, null, 1));
	expect(true).toBe(true);
});
