import { createHash } from "node:crypto";
import { type Dirent, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { lookupFrame } from "./projection";

/** The deterministic authored source a terminal process starts from. */
export function terminalSourceVersion(root: string, frame: string): string {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") throw new DesignBoundaryError(`frames/${frame}`);
	const designDir = realDesignDir(root);
	const frameDir = resolveDesignPath(designDir, found.dir, designPath(designDir, found.dir));
	const excludedFiles = new Set([
		excludedTarget(join(frameDir, "frame.json")),
		excludedTarget(join(designDir, "canvas.json")),
	]);
	const appStateDir = excludedTarget(join(designDir, ".spool"));
	const hash = createHash("sha256");
	const visited = new Set<string>();

	walk(frameDir, designPath(designDir, frameDir), true);
	walk(join(designDir, "shared"), "shared", false);
	return hash.digest("hex");

	function walk(authoredDir: string, logicalDir: string, frameRoot: boolean): void {
		const canonicalDir = resolveDesignPath(designDir, authoredDir, logicalDir);
		if (excluded(canonicalDir)) return;
		if (visited.has(canonicalDir)) {
			stamp("cycle", logicalDir);
			return;
		}
		visited.add(canonicalDir);
		stamp("dir", logicalDir);

		let entries: Dirent<string>[];
		try {
			entries = readdirSync(canonicalDir, { withFileTypes: true, encoding: "utf8" });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
			if (frameRoot && entry.name === "frame.json") continue;
			const authored = join(canonicalDir, entry.name);
			const logical = `${logicalDir}/${entry.name}`;
			const link = lstatSync(authored).isSymbolicLink();
			if (link) stamp("link", logical, readlinkSync(authored));

			let canonical: string;
			try {
				canonical = resolveDesignPath(designDir, authored, logical);
			} catch (error) {
				if (link && isCyclicLink(authored)) continue;
				throw error;
			}
			if (excluded(canonical)) continue;
			const stat = statSync(canonical);
			if (stat.isDirectory()) walk(canonical, logical, false);
			else if (stat.isFile()) stamp("file", logical, readFileSync(canonical));
		}
	}

	function stamp(kind: string, path: string, value?: string | Buffer): void {
		const fields: Array<{ type: number; value: string | Buffer }> = [
			{ type: 1, value: kind },
			{ type: 2, value: path },
		];
		if (value !== undefined) fields.push({ type: typeof value === "string" ? 3 : 4, value });
		// Record marker + field count, then semantic type + u64 byte length per
		// field. Source bytes can contain any delimiter without crossing records.
		hash.update(Uint8Array.of(0x52, fields.length));
		for (const field of fields) {
			const bytes = typeof field.value === "string" ? Buffer.from(field.value) : field.value;
			const header = Buffer.allocUnsafe(9);
			header.writeUInt8(field.type, 0);
			header.writeBigUInt64BE(BigInt(bytes.byteLength), 1);
			hash.update(header).update(bytes);
		}
	}

	function excludedTarget(file: string): string {
		try {
			return resolveDesignPath(designDir, file);
		} catch (error) {
			if (error instanceof DesignBoundaryError) return file;
			throw error;
		}
	}

	function excluded(file: string): boolean {
		return excludedFiles.has(file) || within(appStateDir, file);
	}
}

function isCyclicLink(file: string): boolean {
	try {
		realpathSync(file);
		return false;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ELOOP";
	}
}

function designPath(designDir: string, file: string): string {
	return relative(designDir, file).split(sep).join("/");
}

function within(base: string, file: string): boolean {
	const rel = relative(base, file);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}
