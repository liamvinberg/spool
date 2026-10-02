import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** A path Spool would otherwise read outside the registered project's design/. */
export class DesignBoundaryError extends Error {
	/** The path as the project spelled it: what a stylesheet worker hands back to rebuild this error. */
	constructor(readonly authored: string) {
		super(`design boundary: "${authored}" resolves outside design/`);
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
	return designPathResolver(designDir)(file, authored);
}

/**
 * resolveDesignPath for every path one pass reads, such as a compile's inputs
 * or one bundle's loads. The design root and each directory are canonicalized
 * once per resolver rather than once per path. Canonicalizing walks the path
 * from / with an lstat per component, and on a frame with a hundred inputs
 * those walks were most of what its compile did on the daemon's event loop.
 *
 * A resolver lasts one pass and no longer. A directory swapped for a symlink
 * after the resolver first canonicalized it is seen by the next pass, as an
 * edit that lands after a pass read its file is: a check and the read it
 * guards were never one atomic step.
 */
export function designPathResolver(designDir: string): (file: string, authored?: string) => string {
	const authoredDesign = resolve(designDir);
	// canonicalized on the first path, so a design folder that is gone fails
	// that path the way resolveDesignPath always has, not the resolver's maker
	let canonicalDesign: string | undefined;
	const directories = new Map<string, string>();
	function canonicalDirectory(directory: string): string {
		let canonical = directories.get(directory);
		if (canonical === undefined) {
			canonical = realpathSync(directory);
			directories.set(directory, canonical);
		}
		return canonical;
	}

	return (file, authored = designRelativePath(designDir, file)) => {
		canonicalDesign ??= realpathSync(designDir);
		const target = resolve(file);
		if (!isWithin(authoredDesign, target) && !isWithin(canonicalDesign, target)) {
			throw new DesignBoundaryError(authored);
		}

		const missing: string[] = [];
		let ancestor = target;
		let link: boolean;
		while (true) {
			try {
				link = lstatSync(ancestor).isSymbolicLink();
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
			// A path that is no link is its directory's canonical path and its own
			// name; a link is followed whole.
			const parent = dirname(ancestor);
			canonicalAncestor =
				link || parent === ancestor ? realpathSync(ancestor) : join(canonicalDirectory(parent), basename(ancestor));
		} catch {
			// lstat found a dangling symlink. Following it for a direct write could
			// create a file outside design/, so it is never a lawful ancestor.
			throw new DesignBoundaryError(authored);
		}
		rejectOutside(canonicalDesign, canonicalAncestor, authored);
		const canonicalTarget = join(canonicalAncestor, ...missing);
		rejectOutside(canonicalDesign, canonicalTarget, authored);
		return canonicalTarget;
	};
}

/** A stable design-relative spelling for diagnostics and cache inputs. */
export function designRelativePath(designDir: string, file: string): string {
	return relative(designDir, resolve(file)).split(sep).join("/") || ".";
}
