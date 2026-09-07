import type { Pointed } from "shared/lib/spool/agent-selection";

export type AgentHelp = { text: string; selection: readonly Pointed[] };
export type AgentRequest = AgentHelp & { id: number };
export type AgentTarget = { selection: readonly Pointed[]; description: string; scope: string };

export function elementSelection(node: HTMLElement | null, name: string): Pointed[] {
	const frame = node?.closest<HTMLElement>("[data-frame-shell]")?.dataset.frameShell;
	if (!node || !frame) return [];
	return [
		{
			id: node.dataset.editNode ?? frame,
			kind: "element",
			frame,
			name,
			path:
				node.dataset.owner ?? node.closest<HTMLElement>("[data-owner]")?.dataset.owner ?? `frames/${frame}/frame.tsx`,
			// Authored source identity, like the rest of the fixed editing fixture.
			lines: node.dataset.shared ? [12, 34] : [40, 62],
			selector: `[data-edit-node="${node.dataset.editNode}"]`,
			excerpt: node.outerHTML.slice(0, 240),
		},
	];
}

export function agentTarget(node: HTMLElement | null, name: string, scope: string): AgentTarget {
	const selection = elementSelection(node, name);
	const point = selection[0];
	return {
		selection,
		description: point
			? `${name} in ${point.frame} (${point.path})`
			: "The original target needs to be located in current source",
		scope: `${scope}${node?.dataset.shared ? "; shared definition" : "; this use"}`,
	};
}

export function prepareHelp(target: AgentTarget, text: string): AgentHelp {
	return { text: `${text}\n\nTarget: ${target.description}.\nScope: ${target.scope}.`, selection: target.selection };
}
