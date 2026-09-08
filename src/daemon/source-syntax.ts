import { basename, extname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import type { JSXElement, Node } from "@babel/types";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { fingerprintOf } from "./hand-write";
import { walkNodes } from "./jsx-walk";

export function elementAt(source: string, at: string): { node: JSXElement; ancestors: Node[] } {
	const [, line, column] = /:(\d+):(\d+)$/.exec(at) ?? [];
	let found: { node: JSXElement; ancestors: Node[] } | undefined;
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node, ancestors) => {
		if (
			node.type === "JSXElement" &&
			node.loc?.start.line === Number(line) &&
			node.loc.start.column + 1 === Number(column)
		) {
			found = { node, ancestors: [...ancestors] };
		}
	});
	if (found === undefined) throw new Error("stale source target");
	return found;
}

export function sourceTarget(
	root: string,
	path: string,
	inputs: ReadonlyMap<string, { bytes: Buffer }>,
): { file: string; revision: string } {
	const design = realDesignDir(root);
	const file = resolveDesignPath(design, join(design, path));
	for (const candidate of [path, relative(design, file)]) {
		const parts = candidate.split(/[\\/]/);
		if (
			parts.some((p) => p === ".spool" || p === ".git" || p === "node_modules") ||
			["canvas.json", "frame.json"].includes(basename(candidate)) ||
			![".tsx", ".jsx", ".ts", ".js", ".css"].includes(extname(candidate))
		) {
			throw new Error("not editable project source");
		}
	}
	const input = inputs.get(file);
	if (!input) throw new Error("source is outside the original captured compiler inputs");
	return { file, revision: fingerprintOf(input.bytes.toString("utf8")) };
}
