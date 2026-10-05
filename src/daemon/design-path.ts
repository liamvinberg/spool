import { realpathSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, isWithin, designPathResolver as resolverOver } from "./design-boundary";
import type { DesignFiles } from "./design-files";
import { diskDesignFiles } from "./disk-files";

export { DesignBoundaryError, designRelativePath } from "./design-boundary";

/** The canonical design root for one compile or project-data read. */
export function realDesignDir(root: string): string {
	const canonicalRoot = realpathSync(root);
	const designDir = realpathSync(join(canonicalRoot, "design"));
	if (!isWithin(canonicalRoot, designDir)) throw new DesignBoundaryError("design");
	return designDir;
}

/**
 * Resolve a project path on disk through its deepest existing ancestor, every
 * existing symlink collapsed, refusing one that leaves design/ (see
 * `designPathResolver` in design-boundary.ts).
 */
export function resolveDesignPath(designDir: string, file: string, authored?: string): string {
	return designPathResolver(designDir)(file, authored);
}

/** One pass's resolver for paths under design/, on disk unless other files are given. */
export function designPathResolver(
	designDir: string,
	files: DesignFiles = diskDesignFiles,
): (file: string, authored?: string) => string {
	return resolverOver(designDir, files);
}
