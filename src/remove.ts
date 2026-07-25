import { forgetResolvedProject, resolveRegisteredRoot } from "./registry";

/** Forget a project and close its tab, without touching the project itself. */
export function removeProject(path: string, spoolDir: string): { root: string; removed: boolean } {
	const root = resolveRegisteredRoot(path);
	const result = forgetResolvedProject(spoolDir, root);
	return { root: result.root, removed: result.removed };
}
