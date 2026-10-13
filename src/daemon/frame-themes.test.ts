import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../init";
import { leadingCssImports, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { createPlayerCompiler } from "./play";
import { listProjectFrames } from "./projection";

const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };

/** A face's bytes, distinct per theme so a document's data URI says which one it carries. */
const GEIST = "geist-face-bytes";
const INTER = "inter-face-bytes";
const PROJECT_FACE = "project-face-bytes";

/**
 * A project whose defaults are its own look, and two frames each importing a
 * theme of their own (DEV-284).
 */
function themedProject() {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/tokens.css", "@theme {\n\t--color-primary: #abcdef;\n}\n");
	writeDesignFile(
		root,
		"shared/fonts.css",
		'@import url("https://fonts.example/project.css");\n@font-face { font-family: "ProjectFace"; src: url("assets/fonts/project.woff2"); }\n',
	);
	writeDesignFile(root, "shared/assets/fonts/project.woff2", PROJECT_FACE);
	writeDesignFile(
		root,
		"shared/ui/vercel/theme.css",
		'@import "tailwindcss";\n@theme {\n\t--color-primary: #000001;\n}\n@font-face { font-family: "Geist"; src: url("../../assets/fonts/geist.woff2"); }\n',
	);
	writeDesignFile(root, "shared/assets/fonts/geist.woff2", GEIST);
	writeDesignFile(
		root,
		"shared/ui/linear/theme.css",
		'@import url("https://fonts.example/linear.css");\n@import "tailwindcss";\n@import "./palette.css";\n@font-face { font-family: "Inter"; src: url("./fonts/inter.woff2"); }\n',
	);
	writeDesignFile(root, "shared/ui/linear/palette.css", "@theme {\n\t--color-primary: #000002;\n}\n");
	writeDesignFile(root, "shared/ui/linear/fonts/inter.woff2", INTER);
	writeDesignFile(
		root,
		"shared/ui/button.tsx",
		'export const Button = () => <button className="bg-primary">go</button>;\n',
	);
	writeFrame(
		root,
		"vercel",
		'import "shared/ui/vercel/theme.css";\nimport { Button } from "shared/ui/button";\nexport default () => <Button />;\n',
	);
	writeFrame(
		root,
		"linear",
		'import "shared/ui/linear/theme.css";\nimport { Button } from "shared/ui/button";\nexport default () => <Button />;\n',
	);
	writeFrame(root, "plain", 'import { Button } from "shared/ui/button";\nexport default () => <Button />;\n');
	return root;
}

async function document(compiler: ReturnType<typeof createFrameCompiler>, root: string, frame: string) {
	const served = await compiler.getDocument(root, frame, authority);
	if (served.kind !== "ok") throw new Error(served.kind === "error" ? served.message : served.message);
	return served;
}

const dataOf = (bytes: string) => Buffer.from(bytes).toString("base64");

describe("a frame that imports a theme", () => {
	it("compiles against its own theme and fonts, and none of the project's defaults", async () => {
		const root = themedProject();
		const compiler = createFrameCompiler("0.0.0-test");

		const vercel = (await document(compiler, root, "vercel")).document;
		const linear = (await document(compiler, root, "linear")).document;

		expect(vercel).toContain("#000001");
		expect(vercel).toContain(dataOf(GEIST));
		expect(linear).toContain("#000002");
		expect(linear).toContain(dataOf(INTER));
		expect(linear).toContain("https://fonts.example/linear.css");
		for (const themed of [vercel, linear]) {
			expect(themed).not.toContain("#abcdef");
			expect(themed).not.toContain("ProjectFace");
			expect(themed).not.toContain("https://fonts.example/project.css");
		}
		expect(vercel).not.toContain(dataOf(INTER));
		expect(linear).not.toContain(dataOf(GEIST));
	});
});

describe("a frame that imports no theme", () => {
	it("compiles to the same document whether or not its project holds themes", async () => {
		const root = themedProject();
		// the same frame in a project with no theme anywhere, under the same name
		const twin = join(makeTempDir(), basename(root));
		mkdirSync(twin);
		const { root: themeless } = initProject(twin, join(makeTempDir(), ".spool"));
		for (const [file, from] of [
			["shared/tokens.css", "shared/tokens.css"],
			["shared/fonts.css", "shared/fonts.css"],
			["shared/assets/fonts/project.woff2", "shared/assets/fonts/project.woff2"],
			["shared/ui/button.tsx", "shared/ui/button.tsx"],
			["frames/plain/frame.tsx", "frames/plain/frame.tsx"],
		] as const) {
			writeDesignFile(themeless, file, readFileSync(join(root, "design", from), "utf8"));
		}

		const alongside = await document(createFrameCompiler("0.0.0-test"), root, "plain");
		const alone = await document(createFrameCompiler("0.0.0-test"), themeless, "plain");

		expect(alongside.document).toBe(alone.document);
		expect(alongside.etag).toBe(alone.etag);
		expect(alongside.document).toContain("#abcdef");
		expect(alongside.document).toContain("https://fonts.example/project.css");
		expect(alongside.document).toContain(dataOf(PROJECT_FACE));
	});
});

describe("a frame whose imports reach two themes", () => {
	it("fails to compile, naming both", async () => {
		const root = themedProject();
		writeFrame(
			root,
			"both",
			'import "shared/ui/vercel/theme.css";\nimport "shared/ui/linear/theme.css";\nexport default () => <p />;\n',
		);

		const served = await createFrameCompiler("0.0.0-test").getDocument(root, "both", authority);

		expect(served.kind).toBe("error");
		const message = served.kind === "error" ? served.message : "";
		expect(message).toContain("design/shared/ui/vercel/theme.css");
		expect(message).toContain("design/shared/ui/linear/theme.css");
	});
});

describe("editing a theme", () => {
	it("recompiles only the frames that reach it", async () => {
		const root = themedProject();
		const compiler = createFrameCompiler("0.0.0-test");
		const caches = async () =>
			Object.fromEntries(
				await Promise.all(
					["vercel", "linear", "plain"].map(async (frame) => [
						frame,
						(await document(compiler, root, frame)).cache,
					]),
				),
			);
		await caches();

		writeDesignFile(root, "shared/ui/linear/palette.css", "@theme {\n\t--color-primary: #000003;\n}\n");
		expect(await caches()).toEqual({ vercel: "hit", linear: "miss", plain: "hit" });
		expect((await document(compiler, root, "linear")).document).toContain("#000003");

		writeDesignFile(root, "shared/assets/fonts/geist.woff2", INTER);
		expect(await caches()).toEqual({ vercel: "miss", linear: "hit", plain: "hit" });

		writeDesignFile(root, "shared/tokens.css", "@theme {\n\t--color-primary: #fedcba;\n}\n");
		rmSync(join(root, "design", "shared", "fonts.css"));
		expect(await caches()).toEqual({ vercel: "hit", linear: "hit", plain: "miss" });
	});
});

describe("the player", () => {
	it("gives each themed frame its own tokens and fonts, and the project's only to frames without a theme", async () => {
		const root = themedProject();
		const compiled = await createPlayerCompiler("0.0.0-test").getBundle(root, listProjectFrames(root).frames);
		if (compiled.kind !== "ok") throw new Error(compiled.message);
		const { bundle } = compiled;
		const style = (frame: string) => bundle.chunks.get(bundle.styles.get(frame) ?? "") ?? "";

		// nothing project-wide rides the walk's document for every frame
		expect(bundle.fonts).toBeUndefined();
		expect(style("vercel")).toContain("#000001");
		expect(style("vercel")).toContain(dataOf(GEIST));
		expect(style("linear")).toContain("#000002");
		expect(style("linear")).toContain(dataOf(INTER));
		expect(leadingCssImports(style("linear"))).toEqual(["https://fonts.example/linear.css"]);
		for (const themed of [style("vercel"), style("linear")]) {
			expect(themed).not.toContain("#abcdef");
			expect(themed).not.toContain("ProjectFace");
			expect(themed).not.toContain("https://fonts.example/project.css");
		}
		expect(style("plain")).toContain("#abcdef");
		expect(style("plain")).toContain(dataOf(PROJECT_FACE));
		expect(leadingCssImports(style("plain"))).toEqual(["https://fonts.example/project.css"]);
	});

	it("keeps the project's fonts one block for the walk when no frame has a theme", async () => {
		const root = themedProject();
		const frames = listProjectFrames(root).frames.filter((ref) => ref.name === "plain");
		const compiled = await createPlayerCompiler("0.0.0-test").getBundle(root, frames);
		if (compiled.kind !== "ok") throw new Error(compiled.message);

		expect(compiled.bundle.fonts).toContain("https://fonts.example/project.css");
		expect(compiled.bundle.chunks.get(compiled.bundle.styles.get("plain") ?? "")).not.toContain("ProjectFace");
	});
});
