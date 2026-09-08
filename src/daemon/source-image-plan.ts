import { dirname } from "node:path";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir } from "./design-path";
import { specifierFrom } from "./hand-asset";
import { type RetainedCompilation, readInput, type SourceInput, sameInput } from "./retained-compile";

/** An unregistered image preflight may add only the chosen asset's exact import resolution.
 * The owner still validates the original read and its planned spans before saving anything. */
export async function compileImageChange(
	compiler: FrameCompiler,
	root: string,
	frame: string,
	original: RetainedCompilation,
	file: string,
	next: string,
	asset: { file: string; input: SourceInput },
): Promise<RetainedCompilation> {
	const design = realDesignDir(root);
	assertDesignFile(design, asset.file);
	if (!sameInput(asset.input, readInput(asset.file))) throw new Error("the staged image bytes changed");
	const source = original.inputs.get(file);
	if (!source) throw new Error("the image source is outside the original compiler inputs");
	const inputs = new Map(original.inputs);
	inputs.set(asset.file, asset.input);
	// Supplied frozen bytes are an unregistered compile input, never a receipt or disk observation.
	inputs.set(file, { ...source, bytes: Buffer.from(next) });
	const snapshot = await compiler.compileSnapshot(root, frame, inputs, original.packet.sequence, original.absent);
	const allowed = JSON.stringify([specifierFrom(file, asset.file), file, dirname(file), "import-statement"]);
	for (const [key, resolution] of snapshot.resolutions) {
		const before = original.resolutions.get(key);
		if (before) {
			if (JSON.stringify(before) !== JSON.stringify(resolution))
				throw new Error("an original image resolution changed");
		} else if (
			key !== allowed ||
			resolution.path !== asset.file ||
			resolution.external ||
			resolution.errors?.length
		) {
			throw new Error("the image resolution is outside the chosen staged asset");
		}
	}
	if (snapshot.packet.shape !== original.packet.shape)
		throw new Error("the image replacement changed executable shape");
	for (const [path, input] of original.configuration) {
		if (!sameInput(input, readInput(path))) throw new Error("the image compiler configuration changed");
		snapshot.configuration.set(path, input);
	}
	for (const path of original.configurationAbsent) snapshot.configurationAbsent.add(path);
	assertDesignFile(design, asset.file);
	if (!sameInput(asset.input, readInput(asset.file)))
		throw new Error("the staged image bytes changed during preflight");
	return snapshot;
}
