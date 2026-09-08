import { dirname, extname, resolve } from "node:path";
import { ASSET_MEDIA_TYPES } from "./assets";
import { resolveDesignPath } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";

/** Resolve retained image values exclusively from captured canonical asset inputs. */
export function resolveImageValues(
	compilation: Pick<RetainedCompilation, "cells" | "inputs">,
	designDir: string,
): void {
	for (const cell of Object.values(compilation.cells)) {
		const specifier = cell.image?.specifier;
		if (!specifier) continue;
		const path = resolveDesignPath(
			designDir,
			resolve(specifier.startsWith("shared/") ? designDir : dirname(resolve(designDir, cell.file)), specifier),
		);
		const input = compilation.inputs.get(path);
		const type = ASSET_MEDIA_TYPES[extname(path).toLowerCase()];
		if (!input || !type) throw new Error("the image binding is outside the captured asset inputs");
		cell.value = `data:${type};base64,${input.bytes.toString("base64")}`;
	}
}
