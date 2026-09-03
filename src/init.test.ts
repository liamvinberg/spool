import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSession } from "./daemon/session";
import { SpoolError } from "./errors";
import { initProject } from "./init";
import { readRegistry } from "./registry";
import { makeTempDir, markProject } from "./test-helpers";

function listTree(base: string): string[] {
	const out: string[] = [];
	const walk = (rel: string) => {
		for (const entry of readdirSync(join(base, rel), { withFileTypes: true })) {
			const relPath = join(rel, entry.name);
			if (entry.isDirectory()) {
				out.push(`${relPath}/`);
				walk(relPath);
			} else {
				out.push(relPath);
			}
		}
	};
	walk("design");
	return out.sort();
}

function readDesign(root: string, rel: string): string {
	return readFileSync(join(root, "design", rel), "utf8");
}

describe("initProject", () => {
	it("scaffolds exactly the spec's design/ layout", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(listTree(root)).toEqual([
			"design/.gitignore",
			"design/AGENTS.md",
			"design/CLAUDE.md",
			"design/canvas.json",
			"design/frames/",
			"design/shared/",
			"design/shared/assets/",
			"design/shared/assets/fonts/",
			"design/shared/fonts.css",
			"design/shared/importmap.json",
			"design/shared/lib/",
			"design/shared/lib/utils.ts",
			"design/shared/scenarios/",
			"design/shared/scenarios/default.json",
			"design/shared/tokens.css",
			"design/shared/transitions.css",
			"design/shared/ui/",
		]);
	});

	it("stamps the format version in canvas.json, and turns history on (#158)", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(JSON.parse(readDesign(root, "canvas.json"))).toEqual({ format: 1, history: true });
	});

	it("writes the flag off when the caller opted out", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"), { history: false });

		expect(JSON.parse(readDesign(root, "canvas.json"))).toEqual({ format: 1, history: false });
	});

	it("writes both signposts", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(readDesign(root, "AGENTS.md")).toContain("spool skill");
		expect(readDesign(root, "AGENTS.md")).toContain("frames/<name>/frame.tsx");
		expect(readDesign(root, "AGENTS.md")).toContain("static disabled surface");
		expect(readDesign(root, "AGENTS.md")).toContain("inside an OS sandbox");
		expect(readDesign(root, "AGENTS.md")).toContain(
			"Topics: `spool skill frames|terminals|flows|scenarios|styling|verbs`.",
		);
		expect(readDesign(root, "AGENTS.md")).toContain("saving a never-run terminal does not create one");
		expect(readDesign(root, "AGENTS.md")).toContain("never write app-owned files");
		expect(readDesign(root, "CLAUDE.md")).toBe("@AGENTS.md\n");
	});

	it("writes tokens.css as an empty :root with an instruction comment", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		const tokens = readDesign(root, "shared/tokens.css");
		expect(tokens).toContain(":root {}");
		expect(tokens).toContain("/*");
	});

	it("pins clsx, tailwind-merge, class-variance-authority and motion in the import map", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		const imports = JSON.parse(readDesign(root, "shared/importmap.json")).imports;
		for (const name of ["clsx", "tailwind-merge", "class-variance-authority", "motion", "motion/react"]) {
			expect(imports[name]).toMatch(/^https:\/\/esm\.sh\/.+@\d+\.\d+\.\d+/);
		}
	});

	it("seeds a default scenario of empty state", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(JSON.parse(readDesign(root, "shared/scenarios/default.json"))).toEqual({ state: {} });
	});

	it("gitignores .spool/ inside design/", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		expect(readDesign(root, ".gitignore")).toBe(".spool/\n");
	});

	it("ships cn() in shared/lib/utils.ts", () => {
		const root = makeTempDir();
		initProject(root, join(makeTempDir(), ".spool"));

		const utils = readDesign(root, "shared/lib/utils.ts");
		expect(utils).toContain("export function cn(");
		expect(utils).toContain("twMerge(clsx(inputs))");
	});

	it("registers the project and returns the realpathed root", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const dir = makeTempDir();

		const { root } = initProject(dir, spoolDir);

		expect(root).toBe(realpathSync(dir));
		expect(readRegistry(spoolDir).projects.map((p) => p.root)).toEqual([root]);
		expect(readSession(spoolDir)).toEqual({ open: [root] });
	});

	it("refuses when design/ already exists and is not a spool project", () => {
		const root = makeTempDir();
		mkdirSync(join(root, "design"));
		writeFileSync(join(root, "design", "logo.svg"), "<svg/>");
		const spoolDir = join(makeTempDir(), ".spool");

		expect(() => initProject(root, spoolDir)).toThrow(SpoolError);
		expect(() => initProject(root, spoolDir)).toThrow(/design\/ already exists/);
		expect(existsSync(join(root, "design", "canvas.json"))).toBe(false);
	});

	it("points at spool open when the project is already initialized", () => {
		const root = makeTempDir();
		markProject(root);

		expect(() => initProject(root, join(makeTempDir(), ".spool"))).toThrow(/spool open/);
	});

	it("refuses when the target directory does not exist", () => {
		const missing = join(makeTempDir(), "missing");

		expect(() => initProject(missing, join(makeTempDir(), ".spool"))).toThrow(/no such directory/);
	});
});
