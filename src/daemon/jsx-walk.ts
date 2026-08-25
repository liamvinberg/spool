import type { Node } from "@babel/types";

/**
 * Depth-first over a babel tree, ancestors outermost-first (#34, #253).
 *
 * Both readers of frame source walk it the same way: the claim reader looking
 * for navigation sites, and the write lane looking for the element a stamp
 * points at. Comments are skipped because they hang off the nodes they sit
 * beside and would be visited twice.
 */
export function walkNodes(node: Node, ancestors: Node[], visit: (node: Node, ancestors: Node[]) => void): void {
	visit(node, ancestors);
	ancestors.push(node);
	for (const key of Object.keys(node)) {
		if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
		const value = (node as unknown as Record<string, unknown>)[key];
		for (const child of Array.isArray(value) ? value : [value]) {
			if (typeof child === "object" && child !== null && typeof (child as Node).type === "string") {
				walkNodes(child as Node, ancestors, visit);
			}
		}
	}
	ancestors.pop();
}
