/**
 * The design canvas draws with the code's system, never a copy kept by hand: this
 * writes `src/ui`'s theme and type into `design/shared/`, where every frame's
 * Tailwind compile reads them. Run it once a change to the system is on main, so
 * the team only ever sees what ships; `--check` names what has drifted and changes
 * nothing.
 *
 *   pnpm design:sync [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = `/* Written by \`pnpm design:sync\` from spool's src/ui/theme.css: edit it there.
 * The canvas's frames draw with exactly the system the app ships. */
@import "./typography.css";

`;

/** Every synced file, by its path under the repo root, with what it should hold. */
export function synced(root: string): Map<string, string> {
	const ui = join(root, "src/ui");
	return new Map([
		["design/shared/typography.css", readFileSync(join(ui, "typography.css"), "utf8")],
		["design/shared/tokens.css", HEADER + readFileSync(join(ui, "theme.css"), "utf8")],
	]);
}

/** The synced files whose canvas copy differs from the code's. */
export function drift(root: string): string[] {
	return [...synced(root)]
		.filter(([path, want]) => !existsSync(join(root, path)) || readFileSync(join(root, path), "utf8") !== want)
		.map(([path]) => path);
}

function main(check: boolean): number {
	const root = join(import.meta.dirname, "..");
	if (!existsSync(join(root, "design/canvas.json"))) {
		console.error("design sync: no design/ here yet; any `pnpm dev` verb fetches it");
		return 1;
	}
	const stale = drift(root);
	if (check) {
		if (stale.length === 0) return 0;
		console.error(`design sync: the canvas has drifted from src/ui in ${stale.join(", ")}; run \`pnpm design:sync\``);
		return 1;
	}
	const want = synced(root);
	for (const path of stale) writeFileSync(join(root, path), want.get(path) ?? "");
	console.log(stale.length === 0 ? "design sync: the canvas is in step" : `design sync: wrote ${stale.join(", ")}`);
	return 0;
}

if (process.argv[1] === import.meta.filename) process.exitCode = main(process.argv.includes("--check"));
