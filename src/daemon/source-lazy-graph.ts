import { readdirSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { Metafile } from "esbuild";
import { assertDesignFile } from "./design-path";
import { directoryEntries, type RetainedCompilation } from "./retained-compile";

function globExpression(pattern: string): RegExp {
	const parts = pattern.split(/(\*\*\/|\*\*|\*)/);
	return new RegExp(
		`^${parts.map((part) => (part === "**/" ? "(?:.*/)?" : part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("")}$`,
	);
}

/** esbuild reports computed-import globs in the importing module's metafile,
 * but bypasses onResolve for their members. Capture that actual discovery edge. */
export function captureLazyGraph(designDir: string, metafile: Metafile, compilation: RetainedCompilation): void {
	const groups: NonNullable<RetainedCompilation["globDiscoveries"]>[number][] = [];
	for (const [path, input] of Object.entries(metafile.inputs)) {
		const importer = resolve(designDir, path);
		if (!compilation.inputs.has(importer)) continue;
		for (const imported of input.imports) {
			if (
				!imported.external ||
				imported.kind !== "import-statement" ||
				!imported.path.startsWith(".") ||
				!imported.path.includes("*")
			)
				continue;
			const pattern = resolve(dirname(importer), imported.path).split(sep).join("/");
			const prefix = pattern.slice(0, pattern.indexOf("*"));
			const base = prefix.slice(0, prefix.lastIndexOf("/")) || "/";
			const directories: string[] = [];
			const visit = (directory: string) => {
				assertDesignFile(designDir, directory);
				const entries = directoryEntries(directory),
					previous = compilation.directories.get(directory);
				if (previous !== undefined && previous !== entries)
					throw new Error("computed import directory changed during discovery");
				compilation.directories.set(directory, entries);
				directories.push(directory);
				if (entries === "absent") return;
				if (!statSync(directory).isDirectory()) return;
				for (const entry of readdirSync(directory, { withFileTypes: true }))
					if (entry.isDirectory()) visit(resolve(directory, entry.name));
			};
			visit(base);
			const expression = globExpression(pattern);
			const files = [...compilation.inputs.keys()]
				.filter((file) => expression.test(file.split(sep).join("/")))
				.sort();
			groups.push({ importer, files, directories: directories.sort() });
		}
	}
	compilation.globDiscoveries = groups.sort(
		(a, b) => a.importer.localeCompare(b.importer) || JSON.stringify(a.files).localeCompare(JSON.stringify(b.files)),
	);
}
