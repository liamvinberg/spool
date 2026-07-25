import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** A path Spool would otherwise read outside the registered project's design/. */
export class DesignBoundaryError extends Error {
	constructor(path: string) {
		super(`design boundary: "${path}" resolves outside design/`);
	}
}

/** The canonical design root for one compile or project-data read. */
export function realDesignDir(root: string): string {
	const canonicalRoot = realpathSync(root);
	const designDir = realpathSync(join(canonicalRoot, "design"));
	if (!isWithin(canonicalRoot, designDir)) throw new DesignBoundaryError("design");
	return designDir;
}

function isWithin(base: string, target: string): boolean {
	const rel = relative(base, target);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function rejectOutside(designDir: string, target: string, authored: string): void {
	if (!isWithin(designDir, target)) throw new DesignBoundaryError(authored);
}

/**
 * Resolve a project path through its deepest existing ancestor. This covers
 * both reads and not-yet-created write targets: every existing symlink is
 * collapsed before the final path is returned, and a dangling symlink is
 * rejected instead of becoming a write-through escape.
 */
export function resolveDesignPath(
	designDir: string,
	file: string,
	authored = designRelativePath(designDir, file),
): string {
	const authoredDesign = resolve(designDir);
	const canonicalDesign = realpathSync(designDir);
	const target = resolve(file);
	if (!isWithin(authoredDesign, target) && !isWithin(canonicalDesign, target)) {
		throw new DesignBoundaryError(authored);
	}

	const missing: string[] = [];
	let ancestor = target;
	while (true) {
		try {
			lstatSync(ancestor);
			break;
		} catch {
			const parent = dirname(ancestor);
			if (parent === ancestor) throw new DesignBoundaryError(authored);
			missing.unshift(basename(ancestor));
			ancestor = parent;
		}
	}

	let canonicalAncestor: string;
	try {
		canonicalAncestor = realpathSync(ancestor);
	} catch {
		// lstat found a dangling symlink. Following it for a direct write could
		// create a file outside design/, so it is never a lawful ancestor.
		throw new DesignBoundaryError(authored);
	}
	rejectOutside(canonicalDesign, canonicalAncestor, authored);
	const canonicalTarget = join(canonicalAncestor, ...missing);
	rejectOutside(canonicalDesign, canonicalTarget, authored);
	return canonicalTarget;
}

/**
 * Reject an existing file unless its resolved target belongs to design/. Keep
 * the authored spelling in the error: absolute outside paths reveal nothing
 * useful and make diagnostics vary by machine.
 */
export function assertDesignFile(
	designDir: string,
	file: string,
	authored = designRelativePath(designDir, file),
): void {
	resolveDesignPath(designDir, file, authored);
}

/** A stable design-relative spelling for diagnostics and cache inputs. */
export function designRelativePath(designDir: string, file: string): string {
	return relative(designDir, resolve(file)).split(sep).join("/") || ".";
}
