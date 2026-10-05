import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { DesignFiles } from "./design-files";

/** A path Spool would otherwise read outside the registered project's design/. */
export class DesignBoundaryError extends Error {
	/** The path as the project spelled it: what a stylesheet worker hands back to rebuild this error. */
	constructor(readonly authored: string) {
		super(`design boundary: "${authored}" resolves outside design/`);
	}
}

export function isWithin(base: string, target: string): boolean {
	const rel = relative(base, target);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function rejectOutside(designDir: string, target: string, authored: () => string): void {
	if (!isWithin(designDir, target)) throw new DesignBoundaryError(authored());
}

/**
 * A resolver for every path one pass reads, such as a compile's inputs or one
 * bundle's loads, through the files it is given. A path resolves through its
 * deepest existing ancestor, which covers both reads and not-yet-created write
 * targets: every existing symlink is collapsed before the final path is
 * returned, and a dangling symlink is rejected instead of becoming a
 * write-through escape.
 *
 * The design root and each directory are canonicalized once per resolver
 * rather than once per path. Canonicalizing walks the path from / with an
 * lstat per component, and on a frame with a hundred inputs those walks were
 * most of what its compile did on the daemon's event loop.
 *
 * A resolver lasts one pass and no longer. A directory swapped for a symlink
 * after the resolver first canonicalized it is seen by the next pass, as an
 * edit that lands after a pass read its file is: a check and the read it
 * guards were never one atomic step.
 */
export function designPathResolver(designDir: string, files: DesignFiles): (file: string, authored?: string) => string {
	const authoredDesign = resolve(designDir);
	// canonicalized on the first path, so a design folder that is gone fails
	// that path, not the resolver's maker
	let canonicalDesign: string | undefined;
	const directories = new Map<string, string>();
	function realpath(path: string): string {
		const canonical = files.realpath(path);
		if (canonical === undefined) throw new Error(`no such file or directory: ${path}`);
		return canonical;
	}
	function canonicalDirectory(directory: string): string {
		let canonical = directories.get(directory);
		if (canonical === undefined) {
			canonical = realpath(directory);
			directories.set(directory, canonical);
		}
		return canonical;
	}

	return (file, spelled) => {
		// spelled out only for a refusal: on the paths that pass, which is nearly
		// all of them, the relative spelling was a third of the resolver's work
		const authored = (): string => spelled ?? designRelativePath(designDir, file);
		canonicalDesign ??= realpath(designDir);
		const target = resolve(file);
		if (!isWithin(authoredDesign, target) && !isWithin(canonicalDesign, target)) {
			throw new DesignBoundaryError(authored());
		}

		const missing: string[] = [];
		let ancestor = target;
		let kind = files.kind(ancestor);
		while (kind === undefined) {
			const parent = dirname(ancestor);
			if (parent === ancestor) throw new DesignBoundaryError(authored());
			missing.unshift(basename(ancestor));
			ancestor = parent;
			kind = files.kind(ancestor);
		}

		let canonicalAncestor: string;
		try {
			// A path that is no link is its directory's canonical path and its own
			// name; a link is followed whole.
			const parent = dirname(ancestor);
			canonicalAncestor =
				kind === "symlink" || parent === ancestor
					? realpath(ancestor)
					: join(canonicalDirectory(parent), basename(ancestor));
		} catch {
			// a dangling symlink. Following it for a direct write could create a
			// file outside design/, so it is never a lawful ancestor.
			throw new DesignBoundaryError(authored());
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
