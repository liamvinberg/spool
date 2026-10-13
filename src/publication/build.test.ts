import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { leadingCssImports, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { buildWebsite, writeWebsite } from "./build";
import { withCapturedWebsite } from "./capture";
import { fetchPublicResource } from "./fetch";
import { sha256, validateManifest } from "./manifest";

function project() {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeFrame(
		root,
		"start",
		'import {ui} from "spool"; export default () => <button data-go="next" onClick={() => ui.state.count = Number(ui.state.count) + 1}>Continue</button>;',
	);
	writeFrame(
		root,
		"next",
		'import {ui} from "spool"; export default () => <button onClick={() => ui.back()}>{String(ui.state.count)}</button>;',
	);
	writeFrame(root, "draft", "UNRELATED_SECRET broken {{{");
	writeDesignFile(root, "shared/scenarios/default.json", '{"state":{"count":4}}');
	return { root, entry: "start", version: "0.19.0-test" };
}

describe("portable website build", { timeout: 30000 }, () => {
	it("builds deterministic connected objects without source or local authority", async () => {
		const options = project();
		const first = await buildWebsite(options);
		const second = await buildWebsite(options);
		expect(second.manifest).toEqual(first.manifest);
		expect(second.inputIdentity).toBe(first.inputIdentity);
		expect(validateManifest(first.manifest).frames.map(({ name }) => name)).toEqual(["start", "next"]);
		for (const object of first.manifest.objects) {
			const bytes = first.objects.get(object.path)?.bytes;
			expect(bytes?.byteLength).toBe(object.byteLength);
			expect(bytes === undefined ? undefined : sha256(bytes)).toBe(object.sha256);
		}
		const emitted = [...first.objects.values()].map(({ bytes }) => Buffer.from(bytes).toString("utf8")).join("\n");
		for (const forbidden of [
			options.root,
			"UNRELATED_SECRET",
			"X-Spool-Project",
			"/api/p/",
			"player-command",
			"player-geometry",
			"design/frames/",
			"sourceMappingURL",
			"spool-picker",
		])
			expect(emitted).not.toContain(forbidden);
		const out = join(makeTempDir(), "site");
		writeWebsite(first, out, options.root);
		expect(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"))).toEqual(first.manifest);
	});
	it("retries a changed capture and ignores position-only and unrelated draft changes in its identity", async () => {
		const options = project();
		let reads = 0;
		const first = await buildWebsite({
			...options,
			afterRead(attempt) {
				reads++;
				if (attempt === 1) writeDesignFile(options.root, "shared/scenarios/default.json", '{"state":{"count":9}}');
			},
		});
		expect(reads).toBe(2);
		expect(Buffer.from(first.objects.get("seed.json")?.bytes ?? []).toString()).toBe('{"count":9}');
		writeDesignFile(options.root, "frames/start/frame.json", '{"x":200,"y":700,"w":1440,"h":900}');
		writeFrame(options.root, "draft", "MORE_UNRELATED_SECRET broken");
		const second = await buildWebsite(options);
		expect(second.inputIdentity).toBe(first.inputIdentity);
		expect(second.manifest.contentIdentity).toBe(first.manifest.contentIdentity);
	});
	it("revalidates import directory choices", async () => {
		const options = project();
		writeFrame(options.root, "start", 'import {View} from "./view"; export default () => <View/>;');
		writeDesignFile(options.root, "frames/start/view.ts", 'export const View = () => "OLD_CHOICE";');
		let reads = 0;
		const artifact = await buildWebsite({
			...options,
			afterRead(attempt) {
				reads++;
				if (attempt === 1)
					writeDesignFile(
						options.root,
						"frames/start/view.tsx",
						"export const View = () => <div>NEW_CHOICE</div>;",
					);
			},
		});
		expect(reads).toBe(2);
		const emitted = [...artifact.objects.values()].map(({ bytes }) => Buffer.from(bytes).toString()).join("");
		expect(emitted).toContain("NEW_CHOICE");
		expect(emitted).not.toContain("OLD_CHOICE");
	});
	it("rechecks resolution changes that land before directory inventories are captured", async () => {
		const options = project();
		writeFrame(options.root, "start", 'import {View} from "./view"; export default () => <View/>');
		writeDesignFile(options.root, "frames/start/view.ts", 'export const View=()=>"OLD_RESOLUTION";');
		let reads = 0;
		const artifact = await buildWebsite({
			...options,
			afterDiscovery(attempt) {
				reads++;
				if (attempt === 1)
					writeDesignFile(options.root, "frames/start/view.tsx", "export const View=()=> <p>NEW_RESOLUTION</p>");
			},
		});
		expect(reads).toBe(2);
		const emitted = [...artifact.objects.values()].map(({ bytes }) => Buffer.from(bytes).toString()).join("");
		expect(emitted).toContain("NEW_RESOLUTION");
		expect(emitted).not.toContain("OLD_RESOLUTION");
	});
	it("bounds unstable capture and never retries a consumer failure", async () => {
		const options = project();
		let reads = 0;
		await expect(
			buildWebsite({
				...options,
				afterRead() {
					reads++;
					writeDesignFile(
						options.root,
						"shared/scenarios/default.json",
						JSON.stringify({ state: { count: reads } }),
					);
				},
			}),
		).rejects.toThrow("after 3 attempts");
		expect(reads).toBe(3);
		let uses = 0;
		await expect(
			withCapturedWebsite(options, async () => {
				uses++;
				throw new Error("consumer stopped");
			}),
		).rejects.toThrow("consumer stopped");
		expect(uses).toBe(1);
	});
	it("fails connected syntax, targets, dependencies and explicit or malformed seeds", async () => {
		const options = project();
		await expect(buildWebsite({ ...options, scenario: "missing" })).rejects.toThrow("does not exist");
		writeDesignFile(options.root, "shared/scenarios/default.json", "{");
		await expect(buildWebsite(options)).rejects.toThrow("default.json");
		writeDesignFile(options.root, "shared/scenarios/default.json", '{"state":{}}');
		writeFrame(options.root, "next", "broken {{{");
		await expect(buildWebsite(options)).rejects.toThrow("next");
		writeFrame(options.root, "next", 'export default () => <a data-go="missing"/>;');
		await expect(buildWebsite(options)).rejects.toThrow("missing");
		writeFrame(options.root, "next", 'import image from "./absent.png"; export default () => <img src={image}/>;');
		await expect(buildWebsite(options)).rejects.toThrow("absent.png");
	});
	it("keeps a frame stylesheet's @import at the head of its published stylesheet", async () => {
		const options = project();
		writeDesignFile(
			options.root,
			"frames/start/start.css",
			'@import url("https://fonts.test/geist.css");\n.start-only { font-family: Geist; }\n',
		);
		writeFrame(
			options.root,
			"start",
			'import "./start.css"; export default () => <main className="start-only p-7">start</main>;',
		);
		const site = await buildWebsite(options);

		const entry = validateManifest(site.manifest).frames.find(({ name }) => name === "start");
		const bytes = entry === undefined ? undefined : site.objects.get(entry.stylesheet)?.bytes;
		const css = Buffer.from(bytes ?? new Uint8Array()).toString("utf8");
		expect(css).toContain(".start-only");
		// a remote import stays remote, as in a Vite build: the page's policy lets it load
		expect(leadingCssImports(css)).toEqual(["https://fonts.test/geist.css"]);
	});
	it("carries each frame's theme and its font files, and none of the project's defaults", async () => {
		const options = project();
		writeDesignFile(options.root, "shared/tokens.css", "@theme { --color-primary: #abcdef; }\n");
		writeDesignFile(
			options.root,
			"shared/fonts.css",
			'@font-face { font-family: "ProjectFace"; src: url("assets/fonts/project.woff2"); }\n',
		);
		writeDesignFile(options.root, "shared/assets/fonts/project.woff2", "PROJECT_FACE");
		for (const [theme, colour, face] of [
			["vercel", "#000001", "GEIST_FACE"],
			["linear", "#000002", "INTER_FACE"],
		] as const) {
			writeDesignFile(
				options.root,
				`shared/ui/${theme}/theme.css`,
				`@import "tailwindcss";\n@theme { --color-primary: ${colour}; }\n@font-face { font-family: "${theme}"; src: url("./fonts/${theme}.woff2"); }\n`,
			);
			writeDesignFile(options.root, `shared/ui/${theme}/fonts/${theme}.woff2`, face);
		}
		writeFrame(
			options.root,
			"start",
			'import "shared/ui/vercel/theme.css"; export default () => <button data-go="next" className="bg-primary">go</button>;',
		);
		writeFrame(
			options.root,
			"next",
			'import "shared/ui/linear/theme.css"; export default () => <p className="bg-primary">next</p>;',
		);
		const site = await buildWebsite(options);

		const text = (path: string) => Buffer.from(site.objects.get(path)?.bytes ?? new Uint8Array()).toString("utf8");
		const frames = validateManifest(site.manifest).frames;
		for (const [frame, colour, face] of [
			["start", "#000001", "GEIST_FACE"],
			["next", "#000002", "INTER_FACE"],
		] as const) {
			const stylesheet = frames.find(({ name }) => name === frame)?.stylesheet ?? "";
			const css = text(stylesheet);
			expect(css).toContain(colour);
			expect(css).not.toContain("#abcdef");
			expect(css).not.toContain("ProjectFace");
			const font = /url\("([^"]+\.woff2)"\)/.exec(css)?.[1] ?? "";
			expect(text(posix.join(posix.dirname(stylesheet), font))).toBe(face);
		}
		expect(text("styles/fonts.css")).not.toContain("ProjectFace");
	});
	it("captures a shader imported with a query suffix, as the canvas compiles it", async () => {
		const options = project();
		writeFrame(
			options.root,
			"next",
			'import fragment from "./effect.glsl?raw"; export default () => <pre>{fragment}</pre>;',
		);
		writeDesignFile(options.root, "frames/next/effect.glsl", "void main() { /* SHADER_SOURCE */ }");
		const website = await buildWebsite(options);
		const emitted = [...website.objects.values()].map(({ bytes }) => Buffer.from(bytes).toString("utf8")).join("\n");
		expect(emitted).toContain("SHADER_SOURCE");
	});
	it("rejects private resource origins and unsupported authored local URLs", async () => {
		await expect(fetchPublicResource("https://127.0.0.1/private")).rejects.toThrow("private or reserved");
		await expect(fetchPublicResource("http://example.com/module.js")).rejects.toThrow("HTTPS");
		const options = project();
		writeFrame(options.root, "start", 'export default () => <img src="/private-image.png"/>;');
		await expect(buildWebsite(options)).rejects.toThrow("Import the asset");
	});
});

it("preserves existing output on invalid replacement bytes and refuses unrelated files and symlink outputs", async () => {
	const options = project();
	const artifact = await buildWebsite(options);
	const out = join(makeTempDir(), "site");
	writeWebsite(artifact, out, options.root);
	const before = readFileSync(join(out, "manifest.json"), "utf8");
	const objects = new Map(artifact.objects);
	objects.set("seed.json", { bytes: Buffer.from("corrupt"), mediaType: "application/json" });
	expect(() => writeWebsite({ ...artifact, objects }, out, options.root)).toThrow("bytes do not match");
	expect(readFileSync(join(out, "manifest.json"), "utf8")).toBe(before);
	writeFileSync(join(out, "notes.txt"), "keep");
	expect(() => writeWebsite(artifact, out, options.root)).toThrow("other files");
	expect(readFileSync(join(out, "notes.txt"), "utf8")).toBe("keep");
	const alias = join(makeTempDir(), "alias");
	symlinkSync(out, alias);
	expect(() => writeWebsite(artifact, alias, options.root)).toThrow("symlink");
	expect(() => writeWebsite(artifact, join(options.root, "design/out"), options.root)).toThrow("outside design");
});
it("validates metadata identity, object paths and outgoing membership", async () => {
	const artifact = await buildWebsite(project());
	expect(() => validateManifest({ ...artifact.manifest, entry: "next" })).toThrow("content identity");
	expect(() =>
		validateManifest({ ...artifact.manifest, objects: [{ ...artifact.manifest.objects[0], path: "../escape" }] }),
	).toThrow();
	expect(() =>
		validateManifest({
			...artifact.manifest,
			objects: [{ ...artifact.manifest.objects[0], mediaType: "text/html\r\nX-Injected: yes" }],
		}),
	).toThrow();
});
