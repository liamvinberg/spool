/**
 * The tab strip as the keyboard walks it: Home first, then the open projects
 * in the order they are drawn. A slot is `null` for Home or a project's root.
 */
export type TabSlot = string | null;

/** Tab N (⌘1-8), Home being 1; undefined past the end of the strip. */
export function numberedTab(roots: readonly string[], n: number): TabSlot | undefined {
	if (n === 1) return null;
	return roots[n - 2];
}

/** ⌘9: the last tab, which is Home while nothing is open. */
export function lastTab(roots: readonly string[]): TabSlot {
	return roots.at(-1) ?? null;
}

/** The next or previous tab, wrapping round past either end. */
export function steppedTab(roots: readonly string[], focused: TabSlot, step: 1 | -1): TabSlot {
	const strip: TabSlot[] = [null, ...roots];
	const here = Math.max(0, strip.indexOf(focused));
	return strip[(here + step + strip.length) % strip.length] ?? null;
}

/** A tab closed this session, and the slot it stood in among the open tabs. */
export interface ClosedTab {
	root: string;
	slot: number;
}

/**
 * The closed tabs with one more on top. A project closed again comes back
 * from where it was closed last, so it is on the stack once.
 */
export function pushClosed(stack: readonly ClosedTab[], closed: ClosedTab): ClosedTab[] {
	return [...stack.filter((tab) => tab.root !== closed.root), closed];
}

/**
 * The tab ⌘⇧T brings back, and the stack without it: the last closed whose
 * project is still on this machine; any above it that are gone go too.
 */
export function popClosed(
	stack: readonly ClosedTab[],
	known: (root: string) => boolean,
): { tab: ClosedTab | undefined; rest: ClosedTab[] } {
	const rest = [...stack];
	for (let tab = rest.pop(); tab !== undefined; tab = rest.pop()) {
		if (known(tab.root)) return { tab, rest };
	}
	return { tab: undefined, rest };
}

/** The open tabs with a closed one back in its old slot, or as near it as the strip now reaches. */
export function reopenedOrder(open: readonly string[], tab: ClosedTab): string[] {
	if (open.includes(tab.root)) return [...open];
	const next = [...open];
	next.splice(Math.min(Math.max(0, tab.slot), next.length), 0, tab.root);
	return next;
}
