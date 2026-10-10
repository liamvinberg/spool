/**
 * The design canvas draws with the code's system, never a copy kept by hand: this
 * writes `src/ui`'s theme and type into `design/shared/`, where every frame's
 * Tailwind compile reads them, and its primitives, with every file they import,
 * into `design/shared/system/`. Run it once a change to the system is on main, so
 * the team only ever sees what ships; `--check` names what has drifted and changes
 * nothing.
 *
 *   pnpm design:sync [--check]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const HEADER = `/* Written by \`pnpm design:sync\` from spool's src/ui/theme.css: edit it there.
 * The canvas's frames draw with exactly the system the app ships. */
@import "./typography.css";

`;

const SYSTEM = "design/shared/system";

/** The primitives and what they import from the repo, each source file under `src/` once. */
function code(root: string): string[] {
	const dir = join(root, "src/ui/primitives");
	const todo = existsSync(dir)
		? readdirSync(dir)
				.filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
				.map((name) => join(dir, name))
		: [];
	const seen = new Set<string>();
	for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
		if (seen.has(file)) continue;
		seen.add(file);
		for (const [, spec] of readFileSync(file, "utf8").matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
			const base = join(dirname(file), spec ?? "");
			const found = [".tsx", ".ts"].map((ext) => base + ext).find((path) => existsSync(path));
			if (found === undefined)
				throw new Error(`design sync: ${relative(root, file)} imports ${spec}, which is not a file`);
			todo.push(found);
		}
	}
	return [...seen].sort();
}

/** Every synced file, by its path under the repo root, with what it should hold. */
export function synced(root: string): Map<string, string> {
	const ui = join(root, "src/ui");
	const files = new Map([
		["design/shared/typography.css", readFileSync(join(ui, "typography.css"), "utf8")],
		["design/shared/tokens.css", HEADER + readFileSync(join(ui, "theme.css"), "utf8")],
	]);
	for (const file of code(root)) {
		const from = relative(join(root, "src"), file);
		files.set(
			`${SYSTEM}/${from}`,
			`// Written by \`pnpm design:sync\` from src/${from}: edit it there.\n${readFileSync(file, "utf8")}`,
		);
	}
	return files;
}

/** Files under the system folder that no longer come from the code. */
function strays(root: string, want: Map<string, string>): string[] {
	const dir = join(root, SYSTEM);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)))
		.filter((path) => !want.has(path));
}

/** The synced files whose canvas copy differs from the code's, and the strays to delete. */
export function drift(root: string): string[] {
	const want = synced(root);
	return [
		...[...want]
			.filter(([path, text]) => !existsSync(join(root, path)) || readFileSync(join(root, path), "utf8") !== text)
			.map(([path]) => path),
		...strays(root, want),
	];
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
	for (const path of stale) {
		const text = want.get(path);
		if (text === undefined) {
			rmSync(join(root, path));
			continue;
		}
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	console.log(stale.length === 0 ? "design sync: the canvas is in step" : `design sync: wrote ${stale.join(", ")}`);
	return 0;
}

if (process.argv[1] === import.meta.filename) process.exitCode = main(process.argv.includes("--check"));
