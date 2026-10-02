import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { DesignBoundaryError, realDesignDir } from "./design-path";
import { contentDigest } from "./design-reads";
import {
	type CssSource,
	compileFrameCssHere,
	compileFrameCssOnWorker,
	createCssWorkers,
	startCssWorker,
} from "./tailwind";

function project(tokens: string) {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/tokens.css", tokens);
	return { root, designDir: realDesignDir(root) };
}

/** A frame's source as its bundle would hand it to the stylesheet worker. */
function frame(root: string, designDir: string, name: string, className: string): CssSource {
	writeFrame(root, name, `export default () => <p className="${className}">${name}</p>;\n`);
	const file = join(designDir, "frames", name, "frame.tsx");
	return { file, bytes: readFileSync(file) };
}

/**
 * The stylesheet worker is where the daemon compiles a frame's CSS, so what
 * crosses back has to be exactly what compiling here gives: the same bytes, the
 * same stylesheets read, the same refusals.
 */
describe("a frame's stylesheet, compiled on a stylesheet worker", () => {
	it("is byte for byte the stylesheet compiled here", async () => {
		const { root, designDir } = project('@import "./palette.css";\n');
		writeDesignFile(root, "shared/palette.css", "@theme {\n\t--color-ink: #123456;\n}\n");
		const files = [frame(root, designDir, "a", "text-ink p-[13px]")];

		const onWorker = await compileFrameCssOnWorker(designDir, files);
		expect(onWorker).toEqual(await compileFrameCssHere(designDir, files));
		expect(onWorker.css).toContain("#123456");
		// each by the digest of the very bytes compiled
		expect(onWorker.stylesheets).toEqual(
			["tokens.css", "palette.css"].map((name) => {
				const file = join(designDir, "shared", name);
				return { file, digest: contentDigest(readFileSync(file)) };
			}),
		);
	});

	it("keeps each frame's utilities its own while many compile at once", async () => {
		const { root, designDir } = project("@theme {\n\t--color-ink: #123456;\n}\n");
		// more frames than workers, so a worker holds several compiles at once;
		// the first alone uses a theme colour
		const sizes = Array.from({ length: 9 }, (_, index) => 101 + index);
		const sheets = await Promise.all(
			sizes.map((size, index) =>
				compileFrameCssOnWorker(designDir, [
					frame(root, designDir, `f${size}`, `w-[${size}px]${index === 0 ? " text-ink" : ""}`),
				]),
			),
		);
		for (const [index, { css }] of sheets.entries()) {
			for (const size of sizes) {
				expect(css.includes(`${size}px`), `frame ${sizes[index]} carries ${size}px`).toBe(size === sizes[index]);
			}
			// a theme variable one frame used is never marked used for another
			expect(css.includes("--color-ink"), `frame ${sizes[index]} carries --color-ink`).toBe(index === 0);
		}
	});

	it("hands back a design-boundary refusal as the same error", async () => {
		const { root, designDir } = project('@import "../../outside.css";\n');
		writeFileSync(join(root, "outside.css"), "@theme { --color-outside: red; }\n");

		const here = await compileFrameCssHere(designDir, []).catch((error: unknown) => error);
		const onWorker = await compileFrameCssOnWorker(designDir, []).catch((error: unknown) => error);
		expect(here).toBeInstanceOf(DesignBoundaryError);
		expect(onWorker).toBeInstanceOf(DesignBoundaryError);
		expect((onWorker as Error).message).toBe((here as Error).message);
	});

	it("hands back a stylesheet failure in the words it failed with", async () => {
		const { designDir } = project('@plugin "./plugin.js";\n');

		await expect(compileFrameCssOnWorker(designDir, [])).rejects.toThrow(
			"@plugin and @config are not supported in tokens.css",
		);
	});

	it("fails the compiles a dying worker held, and starts a fresh one for the next", async () => {
		const { root, designDir } = project("@theme {\n\t--color-ink: #123456;\n}\n");
		const files = [frame(root, designDir, "a", "text-ink")];
		let started = 0;
		// the first worker dies on the first job it is handed, with both in hand
		const compile = createCssWorkers(() => {
			started++;
			if (started > 1) return startCssWorker();
			return new Worker(
				'require("node:worker_threads").parentPort.on("message", () => setTimeout(() => process.exit(7), 50));',
				{ eval: true },
			);
		}, 1);

		const held = [compile(designDir, files), compile(designDir, files)];
		for (const job of held) await expect(job).rejects.toThrow("the stylesheet worker stopped (exit code 7)");
		await expect(compile(designDir, files)).resolves.toEqual(await compileFrameCssHere(designDir, files));
		expect(started).toBe(2);
	});

	it("fails a job a stuck worker never answers, and stops that worker for a fresh one", {
		timeout: 20_000,
	}, async () => {
		const { root, designDir } = project("@theme {\n\t--color-ink: #123456;\n}\n");
		const files = [frame(root, designDir, "a", "text-ink")];
		const workers: Worker[] = [];
		// the first worker takes every job and answers none of them
		const compile = createCssWorkers(
			() => {
				const worker =
					workers.length === 0
						? new Worker('require("node:worker_threads").parentPort.on("message", () => {});', { eval: true })
						: startCssWorker();
				workers.push(worker);
				return worker;
			},
			1,
			// long enough for the fresh worker to start and answer on a loaded machine
			3000,
		);

		const stuck = compile(designDir, files);
		const behind = compile(designDir, files);
		await expect(stuck).rejects.toThrow("a frame stylesheet took longer than 3 s, so its worker was stopped");
		await expect(behind).rejects.toThrow();
		await expect(compile(designDir, files)).resolves.toEqual(await compileFrameCssHere(designDir, files));
		expect(workers).toHaveLength(2);
		// the stuck one is gone, not left running beside its replacement
		expect(workers[0]?.threadId).toBe(-1);
	});
});
