// Throwaway DOM receipts. These exercise presentation, not source admission.
export type Entry = {
	node: HTMLElement;
	style: string;
	html: string | null;
	parent: Node | null;
	next: ChildNode | null;
	attributes: Record<string, string | null>;
};
export type Snapshot = Entry[];
export type Transaction = { before: Snapshot; after?: Snapshot; label: string };
const tracked = ["src", "alt", "data-md-style", "data-hover-style"];
const nodes = new WeakMap<HTMLElement, HTMLElement[]>();
export function snapshot(root: HTMLElement): Snapshot {
	let known = nodes.get(root);
	if (!known) {
		known = [...root.querySelectorAll<HTMLElement>("[data-edit-node]")];
		nodes.set(root, known);
	}
	return known.map((node) => ({
		node,
		style: node.style.cssText,
		html: node.dataset.literal !== undefined ? node.innerHTML : null,
		parent: node.parentNode,
		next: node.nextSibling,
		attributes: Object.fromEntries(tracked.map((key) => [key, node.getAttribute(key)])),
	}));
}
function styles(value: string) {
	const style = document.createElement("div").style;
	style.cssText = value;
	return style;
}
type Change = { matches: () => boolean; put: () => void };
function changes(from: Snapshot, to: Snapshot): Change[] {
	const result: Change[] = [];
	for (const a of from) {
		const b = to.find((entry) => entry.node === a.node);
		if (!b) continue;
		const old = styles(a.style),
			next = styles(b.style);
		for (const key of new Set([...old, ...next])) {
			if (
				old.getPropertyValue(key) === next.getPropertyValue(key) &&
				old.getPropertyPriority(key) === next.getPropertyPriority(key)
			)
				continue;
			result.push({
				matches: () =>
					a.node.style.getPropertyValue(key) === old.getPropertyValue(key) &&
					a.node.style.getPropertyPriority(key) === old.getPropertyPriority(key),
				put: () => {
					a.node.style.setProperty(key, next.getPropertyValue(key), next.getPropertyPriority(key));
				},
			});
		}
		if (a.html !== b.html && b.html !== null) {
			const html = b.html;
			result.push({
				matches: () => a.node.innerHTML === a.html,
				put: () => {
					a.node.innerHTML = html;
				},
			});
		}
		for (const key of tracked) {
			const value = b.attributes[key] ?? null;
			if (a.attributes[key] === value) continue;
			result.push({
				matches: () => a.node.getAttribute(key) === a.attributes[key],
				put: () => {
					if (value === null) a.node.removeAttribute(key);
					else a.node.setAttribute(key, value);
				},
			});
		}
		if (a.parent !== b.parent || a.next !== b.next) {
			result.push({
				matches: () => a.node.parentNode === a.parent && a.node.nextSibling === a.next,
				put: () => {
					if (!b.parent) a.node.remove();
					else b.parent.insertBefore(a.node, b.next?.parentNode === b.parent ? b.next : null);
				},
			});
		}
	}
	return result;
}
export function same(a: Snapshot, b: Snapshot) {
	return changes(a, b).length === 0;
}
export function move(from: Snapshot, to: Snapshot, guarded = true) {
	const edits = changes(from, to);
	if (guarded && !edits.every((edit) => edit.matches())) return false;
	for (const edit of edits.reverse()) edit.put();
	return true;
}
