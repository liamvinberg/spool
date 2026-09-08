import { dirname, relative } from "node:path";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir } from "./design-path";
import { specifierFrom } from "./hand-asset";
import { lowerLiterals, type RetainedCompilation, readInput, type SourceInput, sameInput } from "./retained-compile";

import { resolveImageValues } from "./source-image-values";

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

/** A receipt restores only import resolutions and bytes captured before its own write. */
export async function compileImageInverse(
	compiler: FrameCompiler,
	root: string,
	frame: string,
	current: RetainedCompilation,
	file: string,
	next: string,
	restore: RetainedCompilation,
	sourceOnly = false,
): Promise<RetainedCompilation> {
	const source = current.inputs.get(file);
	if (!source) throw new Error("the inverse image source input is missing");
	const inputs = new Map(current.inputs);
	for (const [path, input] of restore.inputs) {
		if (!/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(path)) continue;
		assertDesignFile(realDesignDir(root), path);
		if (!sameInput(input, readInput(path))) throw new Error("the original image bytes changed before undo");
		inputs.set(path, input);
	}
	inputs.set(file, { ...source, bytes: Buffer.from(next) });
	if (sourceOnly) {
		const cells: RetainedCompilation["cells"] = {};
		for (const [path, input] of inputs) {
			if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
			const key = relative(realDesignDir(root), path);
			const lowered = lowerLiterals(key, input.bytes.toString("utf8"));
			if (lowered.shape !== current.shapes[key]) throw new Error("the inverse image changed executable shape");
			Object.assign(cells, lowered.cells);
		}
		const snapshot = {
			...current,
			cells,
			inputs,
			resolutions: new Map([
				...current.resolutions,
				...[...restore.resolutions].filter(([key]) => inputs.has(JSON.parse(key)[1])),
			]),
		};
		resolveImageValues(snapshot, realDesignDir(root));
		return snapshot;
	}
	const snapshot = await compiler.compileSnapshot(root, frame, inputs, current.packet.sequence, current.absent, {
		...current,
		resolutions: new Map([...current.resolutions, ...restore.resolutions]),
	});
	if (snapshot.packet.shape !== current.packet.shape) throw new Error("the inverse image changed executable shape");
	return snapshot;
}
