/**
 * The names New project gives: `untitled`, then `untitled-2`, `untitled-3`… A project still called one of
 * them is one nobody has named yet, which is what lets the agent name it from the first ask and lets
 * closing it empty send it to the Trash.
 */
export function untitledName(n: number): string {
	return n === 1 ? "untitled" : `untitled-${n}`;
}

export function isUntitled(name: string): boolean {
	return /^untitled(-[1-9]\d*)?$/.test(name);
}
