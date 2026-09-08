import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { SourceImagePut } from "../source-image";
import { ASSET_MEDIA_TYPES } from "./assets";
import { designRelativePath, realDesignDir } from "./design-path";
import { ASSET_REQUEST_CAP, assetChosen, assetDestination, assetName, inlinedSize, overBudget } from "./hand-asset";
import { directoryEntries, readInput, type SourceInput } from "./retained-compile";

export interface StagedImage {
	file: string;
	path: string;
	input: SourceInput;
	value: string;
	created?: { directory: string; before: string; after: string };
}

/** Only asset bytes are staged here. Source remains the original owner's separate operation. */
export function stageImageAsset(root: string, frameDir: string, put: SourceImagePut): StagedImage {
	let file: string;
	let path: string;
	let created: StagedImage["created"];
	if (put.kind === "existing") {
		const chosen = assetChosen(root, put.path);
		if (!chosen) throw new Error("this image is outside the project asset boundary");
		file = chosen.file;
		path = designRelativePath(realDesignDir(root), file);
	} else {
		const name = assetName(put.name);
		if (!name) throw new Error("this filename is not a supported project image");
		if (
			put.data.length > ASSET_REQUEST_CAP ||
			!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(put.data)
		)
			throw new Error("the image bytes are not valid bounded base64");
		const bytes = Buffer.from(put.data, "base64");
		const budget = overBudget(inlinedSize(bytes.length));
		if (budget) throw new Error(budget.says);
		const destination = assetDestination(root, frameDir, name, bytes);
		({ file, path } = destination);
		if (destination.write) {
			const directory = dirname(file);
			const before = directoryEntries(directory);
			if (existsSync(file)) throw new Error("the image destination changed before staging");
			writeAtomic(file, bytes);
			const remaining = JSON.stringify(
				readdirSync(directory)
					.filter((name) => name !== basename(file))
					.sort(),
			);
			if (remaining !== before) throw new Error("the image directory changed while staging");
			created = { directory, before, after: directoryEntries(directory) };
		}
	}
	const input = readInput(file);
	const budget = overBudget(inlinedSize(input.bytes.length));
	if (budget) throw new Error(budget.says);
	const type = ASSET_MEDIA_TYPES[extname(file).toLowerCase()];
	if (!type) throw new Error("this image format is not supported");
	return {
		file,
		path,
		input,
		value: `data:${type};base64,${input.bytes.toString("base64")}`,
		...(created ? { created } : {}),
	};
}
