import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { realDesignDir, resolveDesignPath } from "../daemon/design-path";
import { createFlowGraph } from "../daemon/flows";
import { buildPublicationPlayer, type PlayerBundle, type PlayerFrameRef } from "../daemon/play";
import { readIfExists, readScenario } from "../daemon/project-files";
import { frameDirectories, frameGeometry, lookupFrame } from "../daemon/projection";
import { type PublicationReadiness, publicationReadiness } from "../daemon/publication-readiness";
import { mapCssResources } from "./css-resources";
import { canonicalJson, sha256 } from "./manifest";

export interface CaptureOptions {
	root: string;
	entry: string;
	version: string;
	scenario?: string;
	/** Test/operation boundary: all candidate bytes are captured, before validation. */
	afterRead?: (attempt: number) => void | Promise<void>;
}
export interface CapturedWebsite {
	root: string;
	designDir: string;
	readiness: PublicationReadiness;
	frames: (PlayerFrameRef & { w: number; h: number })[];
	scenario: string;
	seed: Record<string, unknown>;
	inputIdentity: string;
	bundle: PlayerBundle;
}

/** Capture and revalidate both bytes and resolution inventories before compiling the held copy. */
export async function withCapturedWebsite<T>(
	options: CaptureOptions,
	use: (capture: CapturedWebsite) => Promise<T>,
): Promise<T> {
	let last: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		const staging = realpathSync(mkdtempSync(join(tmpdir(), "spool-publication-")));
		let delivered = false;
		try {
			const sourceDir = realDesignDir(options.root);
			const inventoryBefore = frameInventory(options.root);
			const readiness = await publicationReadiness(createFlowGraph(), options.root, options.entry);
			if (!readiness.ok)
				throw new Error(
					readiness.diagnostics
						.map(
							(item) =>
								`${item.frame}${item.path === undefined ? "" : ` (${item.path}:${item.line ?? 1})`}: ${item.message} ${item.remedy}`,
						)
						.join("\n"),
				);
			const frames = readiness.included.map((name) => {
				const found = lookupFrame(options.root, name);
				if (found.kind !== "found") throw new Error(`Frame "${name}" changed during capture.`);
				return {
					name,
					...(found.page === undefined ? {} : { page: found.page }),
					...frameGeometry(options.root, name),
				};
			});
			const scenario = options.scenario ?? "default";
			const scenarioFile = join(sourceDir, "shared", "scenarios", `${scenario}.json`);
			if (options.scenario !== undefined && readIfExists(scenarioFile, sourceDir) === undefined)
				throw new Error(
					`Scenario "${scenario}" does not exist. Create it or omit --scenario to use the default seed.`,
				);
			const seedResult = readScenario(options.root, scenario);
			if (seedResult.kind !== "ok") throw new Error(seedResult.message);
			const seed = (JSON.parse(seedResult.json) as { state?: Record<string, unknown> }).state ?? {};
			const discovered = await buildPublicationPlayer(sourceDir, frames, options.version);
			const files = new Set([...discovered.inputs, scenarioFile]);
			for (const ref of frames) {
				const found = lookupFrame(options.root, ref.name);
				if (found.kind === "found") files.add(join(found.dir, "frame.json"));
			}
			collectCssInputs(sourceDir, join(sourceDir, "shared", "fonts.css"), files);
			collectCssInputs(sourceDir, join(sourceDir, "shared", "transitions.css"), files);
			const directories = new Map<string, string>();
			const bytes = new Map<string, Buffer | undefined>();
			for (const file of [...files].sort()) {
				const contained = resolveDesignPath(sourceDir, file);
				let directory = dirname(contained);
				while (directory.startsWith(sourceDir)) {
					if (!directories.has(directory)) directories.set(directory, directoryInventory(directory));
					if (directory === sourceDir) break;
					directory = dirname(directory);
				}
				bytes.set(contained, optionalBytes(contained));
			}
			const targetDir = join(staging, "design");
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, "canvas.json"), "{}\n");
			for (const [file, content] of bytes) {
				if (content === undefined) continue;
				const target = join(targetDir, relative(sourceDir, file));
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, content);
			}
			await options.afterRead?.(attempt);
			if (realDesignDir(options.root) !== sourceDir || inventoryBefore !== frameInventory(options.root))
				throw new Error("Frame inventory changed during capture.");
			for (const [directory, inventory] of directories)
				if (directoryInventory(directory) !== inventory)
					throw new Error("An import directory changed during capture.");
			for (const [file, content] of bytes) {
				if (
					resolveDesignPath(sourceDir, file) !== file ||
					fingerprint(optionalBytes(file)) !== fingerprint(content)
				)
					throw new Error("A relevant file changed during capture.");
			}
			const capturedReadiness = await publicationReadiness(createFlowGraph(), staging, options.entry);
			if (
				!capturedReadiness.ok ||
				canonicalJson(capturedReadiness.outgoing.map(({ frame, targets }) => ({ frame, targets }))) !==
					canonicalJson(readiness.outgoing.map(({ frame, targets }) => ({ frame, targets })))
			)
				throw new Error("Navigation changed during capture. Retry after the current edits settle.");
			const capturedFrames = frames.map((frame) => ({ ...frame, ...frameGeometry(staging, frame.name) }));
			const capturedSeedResult = readScenario(staging, scenario);
			if (capturedSeedResult.kind !== "ok") throw new Error(capturedSeedResult.message);
			const capturedSeed = (JSON.parse(capturedSeedResult.json) as { state?: Record<string, unknown> }).state ?? {};
			if (
				canonicalJson(seed) !== canonicalJson(capturedSeed) ||
				canonicalJson(frames) !== canonicalJson(capturedFrames)
			)
				throw new Error("Scenario or geometry changed during capture.");
			const compiled = await buildPublicationPlayer(targetDir, capturedFrames, options.version);
			const inputIdentity = sha256(
				canonicalJson({
					version: options.version,
					entry: options.entry,
					scenario,
					frames: capturedFrames,
					seed: capturedSeed,
					files: [...bytes]
						.filter(([file]) => !file.endsWith("/frame.json") && file !== scenarioFile)
						.map(([file, content]) => [relative(sourceDir, file), fingerprint(content)]),
				}),
			);
			delivered = true;
			return await use({
				root: staging,
				designDir: targetDir,
				readiness: capturedReadiness,
				frames: capturedFrames,
				scenario,
				seed: capturedSeed,
				inputIdentity,
				bundle: compiled.bundle,
			});
		} catch (error) {
			if (delivered) throw error;
			last = error;
		} finally {
			rmSync(staging, { recursive: true, force: true });
		}
	}
	throw new Error(`Website capture failed after 3 attempts: ${last instanceof Error ? last.message : String(last)}`);
}
function fingerprint(bytes: Buffer | undefined): string {
	return bytes === undefined ? "absent" : sha256(bytes);
}
function optionalBytes(file: string): Buffer | undefined {
	try {
		return readFileSync(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
}
function directoryInventory(directory: string): string {
	try {
		return canonicalJson(
			readdirSync(directory, { withFileTypes: true })
				.map((entry) => [
					entry.name,
					entry.isDirectory()
						? "directory"
						: entry.isSymbolicLink()
							? `link:${realpathSync(join(directory, entry.name))}`
							: "file",
				])
				.sort(),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
		throw error;
	}
}
function frameInventory(root: string): string {
	return canonicalJson([...frameDirectories(root)].sort());
}

/** CSS imports and url() values are finite resources; authored network APIs are not traversed. */
function collectCssInputs(designDir: string, file: string, files: Set<string>, seen = new Set<string>()): void {
	if (seen.has(file)) return;
	seen.add(file);
	files.add(file);
	const css = readIfExists(file, designDir);
	if (css === undefined) return;
	mapCssResources(css, (value, imported) => {
		if (value.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/")) return value;
		const target = resolveDesignPath(designDir, resolve(dirname(file), value.split(/[?#]/)[0] ?? ""));
		files.add(target);
		if (imported || target.endsWith(".css")) collectCssInputs(designDir, target, files, seen);
		return value;
	});
}
