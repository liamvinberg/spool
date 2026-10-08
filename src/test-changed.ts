/**
 * `pnpm test:changed`: the tests closest to what a branch changed, for the loop
 * during work. The full suite still runs once before merging.
 *
 * The changes are everything since the branch left main, committed or not, plus
 * new files. The tests picked are the changed tests themselves, the tests beside
 * a changed file and named for it (`tab-strip.tsx` → `tab-strip.test.ts`,
 * `tab-strip-browser.test.ts`), the tests that import it directly, and the
 * tests that name its path, as a browser suite does when it bundles a component
 * from a string. Runtime under src/runtime/ is bundled and served from disk, so
 * no test imports it, and its directory's suites run for it. Not every test that reaches the file: almost every daemon test
 * imports the whole daemon through test-helpers, so following imports all the
 * way (`--deep`, Vitest's `related`) picks most of the suite for most changes.
 *
 * A change to what every test runs on (the config, the setup, the lockfile)
 * runs everything. `--base <ref>` diffs against another ref; any other argument
 * goes to Vitest.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const everything = [
	"package.json",
	"pnpm-lock.yaml",
	"vitest.config.ts",
	"tsconfig.json",
	"src/test-setup.ts",
	"src/test-global-setup.ts",
];
const testDirs = ["src", ".github/scripts", ".agents/skills"];

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function baseRef(asked: string | undefined): string {
	if (asked !== undefined) return git("merge-base", "HEAD", asked);
	for (const ref of ["origin/main", "main"]) {
		try {
			return git("merge-base", "HEAD", ref);
		} catch {
			// no such ref here: try the next
		}
	}
	return "HEAD";
}

function testFiles(dir: string): string[] {
	const full = join(root, dir);
	if (!existsSync(full)) return [];
	return readdirSync(full, { recursive: true, withFileTypes: true }).flatMap((entry) =>
		entry.isFile() && entry.name.endsWith(".test.ts") && !entry.parentPath.includes("node_modules")
			? [relative(root, join(entry.parentPath, entry.name))]
			: [],
	);
}

const withoutExtension = (file: string) => file.slice(0, file.length - extname(file).length);

const args = process.argv.slice(2);
const deep = args.includes("--deep");
const at = args.indexOf("--base");
const base = baseRef(at === -1 ? undefined : args[at + 1]);
const passed = args.filter((arg, index) => arg !== "--deep" && (at === -1 || (index !== at && index !== at + 1)));

const changed = [
	...new Set([
		...git("diff", "--name-only", base).split("\n"),
		...git("ls-files", "--others", "--exclude-standard").split("\n"),
	]),
].filter((file) => file !== "" && existsSync(join(root, file)));

function run(vitestArgs: string[]): never {
	const result = spawnSync("pnpm", ["exec", "vitest", ...vitestArgs, ...passed], { cwd: root, stdio: "inherit" });
	process.exit(result.status ?? 1);
}

const since = `since ${base.slice(0, 8)}`;
if (changed.length === 0) {
	console.log(`test:changed: nothing changed ${since}`);
	process.exit(0);
}
const wide = changed.filter((file) => everything.includes(file));
if (wide.length > 0) {
	console.log(`test:changed: ${wide.join(", ")} changed, so every test runs`);
	run(["run"]);
}

const tests = testDirs.flatMap(testFiles);
const sources = changed.filter((file) => /\.(ts|tsx|css)$/.test(file) && !file.endsWith(".test.ts"));
const stems = new Set(sources.map(withoutExtension));
/** The source paths, without extension, that a test imports by a relative specifier. */
const imported = (test: string, text: string) =>
	[...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)].flatMap(([, specifier]) => {
		const target = relative(root, resolve(root, dirname(test), specifier ?? ""));
		return [withoutExtension(target), target, join(target, "index")];
	});
/** Runtime the daemon bundles and serves from disk, which no test imports: its own suites stand in. */
const served = sources.some((source) => source.startsWith("src/runtime/"));
const picked = tests.filter((test) => {
	if (changed.includes(test)) return true;
	if (served && test.startsWith("src/runtime/")) return true;
	const name = basename(test, ".test.ts");
	const text = readFileSync(join(root, test), "utf8");
	return (
		sources.some((source) => {
			const stem = basename(withoutExtension(source));
			if (dirname(test) === dirname(source) && (name === stem || name.startsWith(`${stem}-`))) return true;
			const path = withoutExtension(source).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return new RegExp(`${path}(?![\\w-])`).test(text);
		}) || imported(test, text).some((target) => stems.has(target))
	);
});

if (deep) {
	console.log(`test:changed --deep: every test that imports the ${changed.length} files changed ${since}`);
	run(["related", "--run", "--passWithNoTests", ...changed, ...picked]);
}
if (picked.length === 0) {
	console.log(
		`test:changed: no test is beside, imports or names the ${changed.length} files changed ${since}; try --deep, or name a suite`,
	);
	process.exit(0);
}
console.log(`test:changed: ${picked.length} test files for the ${changed.length} files changed ${since}`);
for (const test of picked) console.log(`  ${test}`);
run(["run", ...picked]);
