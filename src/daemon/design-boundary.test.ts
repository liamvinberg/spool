import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { compositionOf, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";
import { PROJECT_HEADER, RENDER_HOST } from "./security";

const SENTINEL = "outside-design-sentinel";

type Escape = "ts" | "json" | "css" | "tailwind" | "symlink";

function renderHarness(spoolDir: string, root: string) {
	const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test" });
	onTestFinished(() => daemon.close());
	const render = (path: string, init?: RequestInit) => daemon.app.request(`http://${RENDER_HOST}${path}`, init);
	const projectData = (path: string) =>
		render(path, { headers: { origin: "null", [PROJECT_HEADER]: daemon.projectCapability(root) } });
	return { render, projectData };
}

function projectWithEscape(kind: Escape) {
	const spoolDir = join(makeTempDir(), ".spool");
	const project = makeProject(spoolDir);
	const outside = join(
		project.root,
		`outside.${kind === "json" ? "json" : kind === "css" || kind === "tailwind" ? "css" : "ts"}`,
	);
	writeFileSync(
		outside,
		kind === "json" ? JSON.stringify({ secret: SENTINEL }) : `export const secret = "${SENTINEL}";\n`,
	);

	let source = "export default function Frame() { return <p>inside</p>; }\n";
	if (kind === "ts")
		source =
			'import { secret } from "../../../outside.ts"; export default function Frame() { return <p>{secret}</p>; }\n';
	if (kind === "json")
		source =
			'import secret from "../../../outside.json"; export default function Frame() { return <p>{secret.secret}</p>; }\n';
	if (kind === "css") {
		writeFileSync(outside, `.outside { color: ${SENTINEL}; }\n`);
		source = 'import "../../../outside.css"; export default function Frame() { return <p>inside</p>; }\n';
	}
	if (kind === "tailwind") {
		writeFileSync(outside, `@theme { --color-outside: ${SENTINEL}; }\n`);
		writeDesignFile(project.root, "shared/tokens.css", '@import "../../outside.css";\n');
	}
	if (kind === "symlink") {
		writeDesignFile(project.root, "shared/placeholder.ts", "export {};\n");
		symlinkSync(outside, join(project.root, "design", "shared", "escape.ts"));
		source =
			'import { secret } from "../../shared/escape.ts"; export default function Frame() { return <p>{secret}</p>; }\n';
	}
	writeFrame(project.root, "entry", source);
	return { ...renderHarness(spoolDir, project.root), ...project };
}

describe("the design filesystem boundary", () => {
	it("rejects a design directory symlink that leaves the project root", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const outsideDesign = join(makeTempDir(), "design");
		mkdirSync(join(outsideDesign, "frames", "entry"), { recursive: true });
		writeFileSync(
			join(outsideDesign, "frames", "entry", "frame.tsx"),
			`export default function Frame() { return <p>${SENTINEL}</p> }\n`,
		);
		rmSync(join(root, "design"), { recursive: true });
		symlinkSync(outsideDesign, join(root, "design"), "dir");
		const { render } = renderHarness(spoolDir, root);

		const response = await render(`/p/${name}/frames/entry`);
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toBe('design boundary: "design" resolves outside design/');
		expect(body).not.toContain(root);
		expect(body).not.toContain(outsideDesign);
		expect(body).not.toContain(SENTINEL);
	});

	it("keeps nested design imports available to both frame and player documents", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/ui/copy.ts", 'export const copy = "inside-design";\n');
		writeFrame(
			root,
			"entry",
			'import { copy } from "../../shared/ui/copy"; export default function Frame() { return <p>{copy}</p>; }\n',
		);
		const { render } = renderHarness(spoolDir, root);

		const frame = await render(`/p/${name}/frames/entry`);
		expect(frame.status).toBe(200);
		expect(await frame.text()).toContain("inside-design");
		const player = await render(`/play/${name}`);
		expect(player.status).toBe(200);
		expect((await compositionOf({ request: render }, await player.text())).all).toContain("inside-design");
	});

	for (const kind of ["ts", "json", "css", "tailwind", "symlink"] as const) {
		it(`rejects an escaped ${kind} input in frame and player documents without exposing its contents`, async () => {
			const { render, name } = projectWithEscape(kind);

			for (const path of [`/p/${name}/frames/entry`, `/play/${name}`]) {
				const res = await render(path);
				expect(res.status).toBe(500);
				const body = await res.text();
				expect(body).toContain("design boundary");
				expect(body).not.toContain(SENTINEL);
			}
		});
	}

	it("keeps an escaped frame entry visible long enough to report the boundary", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "entry", "export default function Frame() { return <p>inside</p> }\n");
		const entry = join(root, "design", "frames", "entry", "frame.tsx");
		const outside = join(root, "outside.tsx");
		writeFileSync(outside, `export default function Frame() { return <p>${SENTINEL}</p> }\n`);
		rmSync(entry);
		symlinkSync(outside, entry);
		const { render } = renderHarness(spoolDir, root);

		for (const path of [`/p/${name}/frames/entry`, `/play/${name}`]) {
			const response = await render(path);
			expect(response.status).toBe(500);
			const body = await response.text();
			expect(body).toContain("design boundary");
			expect(body).not.toContain(SENTINEL);
		}
	});

	// A project asset only escapes through the frame that imports it, and a local
	// face only through the stylesheet that names it (#101) — so those two rows
	// bring the reach that reads them.
	for (const [rel, path, reach] of [
		["shared/fonts.css", "frame", "none"],
		["shared/importmap.json", "frame", "none"],
		["shared/transitions.css", "player", "none"],
		["shared/scenarios/escape.json", "scenario", "none"],
		["shared/assets/logo.svg", "frame", "import"],
		["shared/assets/fonts/local.woff2", "frame", "font"],
	] as const) {
		it(`does not follow an escaped ${rel} symlink`, async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root, name } = makeProject(spoolDir);
			writeFrame(
				root,
				"entry",
				reach === "import"
					? 'import logo from "../../shared/assets/logo.svg";\nexport default function Frame() { return <img src={logo} alt="" />; }\n'
					: "export default function Frame() { return <p>inside</p>; }\n",
			);
			if (reach === "font") {
				writeDesignFile(
					root,
					"shared/fonts.css",
					'@font-face { font-family: "Local"; src: url(./assets/fonts/local.woff2); }\n',
				);
			}
			const outside = join(root, "outside.txt");
			writeFileSync(outside, SENTINEL);
			const link = join(root, "design", rel);
			rmSync(link, { force: true });
			symlinkSync(outside, link);
			const { projectData, render } = renderHarness(spoolDir, root);
			const request =
				path === "frame"
					? `/p/${name}/frames/entry`
					: path === "player"
						? `/play/${name}`
						: `/api/p/${name}/scenarios/escape`;

			const res = path === "scenario" ? await projectData(request) : await render(request);
			expect(res.status).toBeGreaterThanOrEqual(400);
			const body = await res.text();
			expect(body).toContain("design boundary");
			expect(body).not.toContain(SENTINEL);
		});
	}
});
