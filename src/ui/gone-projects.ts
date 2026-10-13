/**
 * Projects on their way off this machine's list: forgotten or moved to the
 * Trash. Their canvas closes as they go, and a canvas closing writes down
 * where its camera was; for one of these there is nobody left to read it, and
 * a forgotten project's folder should not be written to after the person let
 * it go. Page memory only, for the life of the page.
 */
const going = new Set<string>();

/** This project is being forgotten or trashed: its canvas writes nothing more. */
export function letGo(root: string): void {
	going.add(root);
}

/** It stayed after all: the forget or the trash failed. */
export function keep(root: string): void {
	going.delete(root);
}

export function isLetGo(root: string | undefined): boolean {
	return root !== undefined && going.has(root);
}
