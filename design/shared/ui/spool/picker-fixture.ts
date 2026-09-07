// In-memory folders for the app's picker specimens. No filesystem operations.
export type FsEntry = { name: string; path: string; isProject: boolean };
export type FsListing = { path: string; parent: string | null; isProject: boolean; dirs: FsEntry[] };
export type FsHit = FsEntry & { parent: string; matched: readonly number[]; frames?: number };
export type FsSearch = { total: number; answered: number; hits: FsHit[] };
export type OpenOutcome =
	| { kind: "opened"; root: string; name: string }
	| { kind: "offer-init" }
	| { kind: "error"; message: string };
const folders = new Map<string, boolean>([
	["~", false],
	["~/spool", false],
	["~/spool/weekend-idea", true],
	["~/projects", false],
	["~/projects/coffee-shop", false],
	["~/projects/coffee-shop/src", false],
	["~/projects/portfolio", false],
	["~/projects/tvärsö", true],
	["~/projects/tvärsö/design", false],
	["~/Downloads", false],
	["~/Downloads/shared-prototype", true],
]);
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "~");
const nameOf = (path: string) => path.split("/").at(-1) ?? path;
export function isSafeName(name: string) {
	return name.length > 0 && !name.startsWith(".") && !/[\/\\]/.test(name);
}
export async function browseDirectory(path = "~"): Promise<FsListing | undefined> {
	if (!folders.has(path)) return undefined;
	return {
		path,
		parent: path === "~" ? null : parentOf(path),
		isProject: folders.get(path) === true,
		dirs: [...folders]
			.filter(([item]) => item !== path && parentOf(item) === path)
			.map(([item, isProject]) => ({ path: item, name: nameOf(item), isProject })),
	};
}
export async function searchDirectories(query: string, under = "~"): Promise<FsSearch> {
	const hits: FsHit[] = [...folders]
		.filter(([path]) => path.startsWith(`${under}/`) && nameOf(path).toLowerCase().includes(query.toLowerCase()))
		.map(([path, isProject]) => ({ path, name: nameOf(path), parent: parentOf(path), isProject, matched: [] }));
	return { total: folders.size, answered: hits.length, hits };
}
export async function createDirectoryAt(parent: string, name: string): Promise<FsListing> {
	const path = `${parent}/${name}`;
	if (folders.has(path)) throw new Error(`${name} already exists here. Choose another name.`);
	folders.set(path, false);
	return { path, parent, isProject: false, dirs: [] };
}
export async function createProjectAt(parent: string, name: string): Promise<OpenOutcome> {
	let next = name || "untitled";
	if (!name) {
		let suffix = 2;
		while (folders.has(`${parent}/${next}`)) next = `untitled-${suffix++}`;
	}
	const path = `${parent}/${next}`;
	if (folders.has(path)) return { kind: "error", message: `${next} already exists here. Choose another name.` };
	folders.set(path, true);
	return { kind: "opened", root: path, name: next };
}
export async function initProjectAt(path: string): Promise<OpenOutcome> {
	folders.set(path, true);
	return { kind: "opened", root: path, name: nameOf(path) };
}
export async function openProjectAt(path: string): Promise<OpenOutcome> {
	return folders.get(path) ? { kind: "opened", root: path, name: nameOf(path) } : { kind: "offer-init" };
}
export function useWriteSetting() {
	return async (_key: string, _path: string): Promise<{ ok: true } | { ok: false; reason: string }> => ({ ok: true });
}
