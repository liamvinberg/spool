/**
 * The design system's paved path, held by `pnpm check`: the chrome takes its look
 * from the roles in `src/ui/theme.css` and the primitives, never from a colour or a
 * timing of its own.
 *
 * - `old-token`: a colour name from before the system (`bg-surface`, `--color-thread`).
 *   None are left, so none may come back.
 * - `raw-colour`: a hex or rgb() colour in the chrome's code, where a role belongs.
 * - `ad-hoc-motion`: a duration or curve picked on the spot (`duration-150`,
 *   `ease-[…]`, `[transition:…]`), where the motion scale belongs.
 *
 * What the chrome already holds of the last two is allowed per file in
 * `design-lint.allow.json`, and an allowance only shrinks: a file over its
 * allowance fails, and a file under it fails until `--shrink` lowers it, so the
 * debt is paid down and never borrowed again.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export type Rule = "old-token" | "raw-colour" | "ad-hoc-motion";

/** The ten colour names the system replaced, and the two blends that went with them. */
const OLD_NAMES = [
	"border-raised",
	"on-thread",
	"thread-strong",
	"bg",
	"canvas",
	"surface",
	"raised",
	"border",
	"text",
	"muted",
	"thread",
].join("|");
const PREFIX =
	"bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|decoration|caret|accent|placeholder|from|via|to|shadow";
// `border-raised` is also the theme colour Settings -> Colours names, so it is not taken for a utility
const OLD_UTILITY = new RegExp(`(?<![\\w-])(?!border-raised(?![\\w-]))(?:${PREFIX})-(?:${OLD_NAMES})(?![\\w-])`, "g");
const OLD_PROPERTY = new RegExp(`--color-(?:${OLD_NAMES}|control)(?![\\w-])`, "g");
// the filled control's old name; `type-control` and the like were never colours
const OLD_CONTROL = /(?<![\w-])(?:bg|border|ring|outline|from|via|to)-control(?![\w-])/g;

const RAW_COLOUR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\brgba?\(/g;
const AD_HOC_MOTION = /(?<![\w-])(?:duration-(?:\d|\[)|ease-\[|\[transition:|\[animation:)/g;

/** Comments say what a colour or a timing is for; only code can draw one. */
function code(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

const count = (pattern: RegExp, text: string): number => [...text.matchAll(pattern)].length;

/** User projects' own starter tokens, the skill's examples, and this lint's own words for the old names. */
const OWN_NAMES = new Set(["src/templates.ts", "src/skill.ts", "src/design-lint.ts", "src/design-lint.test.ts"]);

/** How often each rule is broken in one file, by its path from the repo root. */
export function scan(path: string, source: string): Partial<Record<Rule, number>> {
	const found: Partial<Record<Rule, number>> = {};
	if (!OWN_NAMES.has(path)) {
		const old = count(OLD_UTILITY, source) + count(OLD_CONTROL, source) + count(OLD_PROPERTY, source);
		if (old > 0) found["old-token"] = old;
	}
	const chrome = path.startsWith("src/ui/") && /\.tsx?$/.test(path) && !/\.test\.tsx?$|test-/.test(path);
	if (chrome) {
		const body = code(source);
		const raw = count(RAW_COLOUR, body);
		if (raw > 0) found["raw-colour"] = raw;
		const motion = count(AD_HOC_MOTION, body);
		if (motion > 0) found["ad-hoc-motion"] = motion;
	}
	return found;
}

export type Allowance = Record<string, Partial<Record<Exclude<Rule, "old-token">, number>>>;

export interface Finding {
	readonly path: string;
	readonly rule: Rule;
	readonly found: number;
	readonly allowed: number;
}

/** Every file whose count differs from its allowance, either way. */
export function judge(scans: ReadonlyMap<string, Partial<Record<Rule, number>>>, allow: Allowance): Finding[] {
	const findings: Finding[] = [];
	const paths = new Set([...scans.keys(), ...Object.keys(allow)]);
	for (const path of [...paths].sort()) {
		const found = scans.get(path) ?? {};
		for (const rule of ["old-token", "raw-colour", "ad-hoc-motion"] as const) {
			const allowed = rule === "old-token" ? 0 : (allow[path]?.[rule] ?? 0);
			const n = found[rule] ?? 0;
			if (n !== allowed) findings.push({ path, rule, found: n, allowed });
		}
	}
	return findings;
}

const ADVICE: Record<Rule, string> = {
	"old-token": "use the role's name from src/ui/theme.css (bg-surface-panel, text-secondary, border-line-strong…)",
	"raw-colour": "draw with a role from src/ui/theme.css, or a blend of one",
	"ad-hoc-motion": "use the motion scale (duration-fast, ease-out…) or a named --animate-*",
};

export function report(findings: readonly Finding[]): string {
	return findings
		.map(({ path, rule, found, allowed }) =>
			found > allowed
				? `${path}: ${rule} ${found}, allowed ${allowed}: ${ADVICE[rule]}`
				: `${path}: ${rule} ${found}, allowance ${allowed}: run \`pnpm design:lint --shrink\` to lower it`,
		)
		.join("\n");
}

const ROOT = join(import.meta.dirname, "..");
const ALLOW = join(import.meta.dirname, "design-lint.allow.json");

function* files(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else if (/\.(tsx?|css)$/.test(entry.name)) yield path;
	}
}

function main(shrink: boolean): number {
	const scans = new Map<string, Partial<Record<Rule, number>>>();
	for (const file of files(join(ROOT, "src"))) {
		const path = relative(ROOT, file).replaceAll("\\", "/");
		const found = scan(path, readFileSync(file, "utf8"));
		if (Object.keys(found).length > 0) scans.set(path, found);
	}
	const allow = JSON.parse(readFileSync(ALLOW, "utf8")) as Allowance;
	if (shrink) {
		const lowered: Allowance = {};
		for (const [path, rules] of Object.entries(allow)) {
			const kept: Allowance[string] = {};
			for (const [rule, allowed] of Object.entries(rules) as [keyof Allowance[string], number][]) {
				const n = Math.min(allowed, scans.get(path)?.[rule] ?? 0);
				if (n > 0) kept[rule] = n;
			}
			if (Object.keys(kept).length > 0) lowered[path] = kept;
		}
		writeFileSync(ALLOW, `${JSON.stringify(lowered, null, "\t")}\n`);
		Object.assign(allow, lowered);
		for (const path of Object.keys(allow)) if (!(path in lowered)) delete allow[path];
	}
	const findings = judge(scans, allow);
	if (findings.length === 0) return 0;
	console.error(`design lint: ${findings.length} finding${findings.length === 1 ? "" : "s"}\n${report(findings)}`);
	return 1;
}

if (process.argv[1] === import.meta.filename) process.exitCode = main(process.argv.includes("--shrink"));
