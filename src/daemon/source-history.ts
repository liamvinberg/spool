import { dirname, extname, resolve } from "node:path";
import { realDesignDir } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";

/** Source history owns the declaration and its compiler dependencies, not the consumer that selected it. */
export function sourceHistoryCompilation(
	root: string,
	compilation: RetainedCompilation,
	ownerFile: string,
): RetainedCompilation {
	const design = realDesignDir(root);
	const required = new Set([...compilation.inputs.keys()].filter((file) => !file.startsWith(`${design}/frames/`)));
	required.add(ownerFile);
	const edges = [...compilation.resolutions].map(([key, result]) => ({
		key,
		parts: JSON.parse(key) as [string, string, string, string],
		result,
	}));
	let changed = true;
	while (changed) {
		changed = false;
		for (const { parts, result } of edges)
			if (
				required.has(parts[1]) &&
				result.path &&
				!result.external &&
				compilation.inputs.has(result.path) &&
				!required.has(result.path)
			) {
				required.add(result.path);
				changed = true;
			}
	}
	// The common stylesheet is part of the declaration's environment in every consumer.
	for (const file of compilation.inputs.keys())
		if (file.startsWith(`${design}/shared/`) && /\.(?:css|json)$/.test(file)) required.add(file);
	const directories = new Set<string>();
	for (const { parts } of edges)
		if (
			required.has(parts[1]) &&
			(parts[0].startsWith(".") || parts[0].startsWith("shared/") || parts[0].startsWith("/"))
		) {
			const target = resolve(parts[0].startsWith("shared/") ? design : parts[2], parts[0]);
			if (!extname(target)) {
				directories.add(target);
				directories.add(dirname(target));
			}
		}
	const ancestors = new Set<string>();
	for (const file of required)
		for (let at = dirname(file); ; at = dirname(at)) {
			ancestors.add(at);
			if (dirname(at) === at) break;
		}
	const keepsConfiguration = (file: string) => ancestors.has(dirname(file)) || !file.startsWith(`${design}/frames/`);
	return {
		...compilation,
		inputs: new Map([...compilation.inputs].filter(([file]) => required.has(file))),
		cells: Object.fromEntries(
			Object.entries(compilation.cells).filter(([, cell]) => required.has(resolve(design, cell.file))),
		),
		resolutions: new Map(edges.filter((edge) => required.has(edge.parts[1])).map((edge) => [edge.key, edge.result])),
		directories: new Map([...compilation.directories].filter(([file]) => directories.has(file))),
		configuration: new Map([...compilation.configuration].filter(([file]) => keepsConfiguration(file))),
		configurationAbsent: new Set([...compilation.configurationAbsent].filter(keepsConfiguration)),
		absent: new Set(
			[...compilation.absent].filter(
				(file) => !file.startsWith(`${design}/frames/`) || ancestors.has(dirname(file)),
			),
		),
	};
}
