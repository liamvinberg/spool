import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { reaimEscapingImports } from "./import-aim";

/**
 * The move-time healing of `../` imports (#273). Each test moves a folder the
 * way the explorer does — renameSync, then the re-aim — and holds the files to
 * what a frame author would want: everything that reached out of the folder
 * still resolves, everything else is byte-identical.
 */

function project() {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root } = makeProject(spoolDir);
	return { root, designDir: realDesignDir(root) };
}

function moveFolder(designDir: string, from: string, to: string): { from: string; to: string } {
	const dirs = { from: join(designDir, from), to: join(designDir, to) };
	mkdirSync(dirname(dirs.to), { recursive: true });
	renameSync(dirs.from, dirs.to);
	reaimEscapingImports(designDir, dirs.from, dirs.to);
	return dirs;
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

describe("re-aiming escaping imports on a move", () => {
	it("spells a shared/ target design-relative, whatever the depth change", () => {
		const { root, designDir } = project();
		writeDesignFile(root, join("shared", "assets", "logo.svg"), "<svg/>");
		writeDesignFile(
			root,
			join("frames", "dashboard", "frame.tsx"),
			'import { cn } from "../../shared/lib/utils";\n' +
				'import logo from "../../shared/assets/logo.svg";\n' +
				'import { Parts } from "./parts";\n' +
				"export default () => cn(logo, Parts);\n",
		);
		writeDesignFile(root, join("frames", "dashboard", "parts.tsx"), "export const Parts = 1;\n");
		mkdirSync(join(designDir, "frames", "site", "landing"), { recursive: true });

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "site", "landing", "dashboard"));

		const frame = read(to, "frame.tsx");
		expect(frame).toContain('from "shared/lib/utils"');
		expect(frame).toContain('from "shared/assets/logo.svg"');
		// what moved with the folder is left exactly as written
		expect(frame).toContain('from "./parts"');
	});

	it("heals a move out of a page the same way", () => {
		const { root, designDir } = project();
		writeDesignFile(
			root,
			join("frames", "site", "landing", "home", "frame.tsx"),
			'import { cn } from "../../../../shared/lib/utils";\nexport default () => cn();\n',
		);

		const { to } = moveFolder(designDir, join("frames", "site", "landing", "home"), join("frames", "home"));

		expect(read(to, "frame.tsx")).toContain('from "shared/lib/utils"');
	});

	it("recomputes a relative path whose target is not in shared/", () => {
		const { root, designDir } = project();
		writeDesignFile(root, join("frames", "notes.css"), "p {}\n");
		writeDesignFile(
			root,
			join("frames", "dashboard", "frame.tsx"),
			'import "../notes.css";\nexport default () => null;\n',
		);
		mkdirSync(join(designDir, "frames", "site"), { recursive: true });

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "site", "dashboard"));

		expect(read(to, "frame.tsx")).toContain('import "../../notes.css"');
	});

	it("leaves an import that answers to no file, and one that escapes design/", () => {
		const { root, designDir } = project();
		const source =
			'import up from "../not/a/file";\nimport out from "../../../etc/passwd";\nexport default () => up + out;\n';
		writeDesignFile(root, join("frames", "dashboard", "frame.tsx"), source);
		mkdirSync(join(designDir, "frames", "site"), { recursive: true });

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "site", "dashboard"));

		expect(read(to, "frame.tsx")).toBe(source);
	});

	it("reads only import positions: a ../ the frame shows or comments on is the author's text", () => {
		const { root, designDir } = project();
		const source =
			'// the helper lives at "../../shared/lib/utils"\n' +
			'import { cn } from "../../shared/lib/utils";\n' +
			'export default () => <a title="../../shared/lib/utils">{cn("../../shared/lib/utils")}</a>;\n';
		writeDesignFile(root, join("frames", "dashboard", "frame.tsx"), source);
		mkdirSync(join(designDir, "frames", "site"), { recursive: true });

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "site", "dashboard"));

		expect(read(to, "frame.tsx")).toBe(source.replace('from "../../shared/lib/utils"', 'from "shared/lib/utils"'));
	});

	it("heals a stylesheet's @import and url() the same way", () => {
		const { root, designDir } = project();
		writeDesignFile(root, join("shared", "tokens.css"), ":root {}\n");
		writeDesignFile(root, join("shared", "assets", "grain.png"), "png");
		writeDesignFile(root, join("frames", "paper.css"), "p {}\n");
		writeDesignFile(
			root,
			join("frames", "dashboard", "frame.css"),
			'@import "../../shared/tokens.css";\n' +
				"@import url('../paper.css');\n" +
				"body { background: url(../../shared/assets/grain.png); }\n",
		);
		writeDesignFile(root, join("frames", "dashboard", "local.svg"), "<svg/>");
		writeDesignFile(
			root,
			join("frames", "dashboard", "styles", "hero.css"),
			'.hero { mask: url("../local.svg"); }\n',
		);
		mkdirSync(join(designDir, "frames", "site"), { recursive: true });

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "site", "dashboard"));

		expect(read(to, "frame.css")).toBe(
			'@import "shared/tokens.css";\n' +
				"@import url('../../paper.css');\n" +
				"body { background: url(shared/assets/grain.png); }\n",
		);
		// reaches up, but lands inside the folder that moved: left as written
		expect(read(to, join("styles", "hero.css"))).toBe('.hero { mask: url("../local.svg"); }\n');
	});

	it("skips a copy or rename beside the original, so a copy is byte-identical", () => {
		const { root, designDir } = project();
		const source = 'import { cn } from "../../shared/lib/utils";\nexport default () => cn();\n';
		writeDesignFile(root, join("frames", "dashboard", "frame.tsx"), source);

		const { to } = moveFolder(designDir, join("frames", "dashboard"), join("frames", "dashboard-copy"));

		expect(read(to, "frame.tsx")).toBe(source);
	});
});
