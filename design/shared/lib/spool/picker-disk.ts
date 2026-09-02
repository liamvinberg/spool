/**
 * A disk to search.
 *
 * The picker's whole problem is that the interesting folder is three levels
 * down and the list only ever shows one level, so a mock with two children per
 * folder would hide the thing being designed. This is one real machine's home
 * as the picker sees it: directories only, dotfolders already dropped, a spool
 * project marked by its `design/canvas.json` the way `daemon/fs-list.ts` marks
 * it. Nothing here is invented for effect — `gym-brute`, `gym-brute-api` and
 * `gym-brute-sketch` all exist, which is exactly the case a ranked search has
 * to get right and an alphabetical list cannot.
 */

export const HOME = "/Users/liamvinberg";

/** name -> its children. A leaf is an empty record, not a null: one shape to walk. */
interface Spec {
	readonly [name: string]: Spec;
}

const TREE: Spec = {
	Applications: {},
	bank: {
		personal: { wiki: { profile: {}, infra: {}, writing: {} }, writing: {}, inbox: {} },
		work: { clients: {}, estate: {} },
	},
	bin: {},
	Desktop: {},
	Documents: { invoices: {}, contracts: {} },
	"dotfiles-legacy": { zsh: {}, nvim: {} },
	"dotfiles.gitless-backup-20260702-224246": {},
	Downloads: {},
	Glaze: {},
	go: { bin: {}, pkg: {}, src: {} },
	Library: { "Application Support": {}, Caches: {}, Fonts: {} },
	Movies: {},
	Music: {},
	"n8n-backup-2026-08-10": { workflows: {}, credentials: {} },
	notes: { daily: {}, ideas: {} },
	personal: {
		experiments: { "gym-brute-sketch": {}, "tailwind-probe": {} },
		lanes: { "issue-76-coffee-transition": {}, "issue-214-agent-hand": {} },
		projects: {
			droneit: {},
			"gym-brute": {},
			kaffe: {},
			notaker: {},
			"opencode-spool": {},
			paperlike: {},
			ruter: {},
			spool: {},
			"spool-cloud": {},
			"spool-terminal": {},
			tretolv: {},
		},
		wiki: {},
	},
	Pictures: { Screenshots: {}, shots: {} },
	Public: {},
	"session-archive": { 2025: { brutelog: {}, gymlog: {} }, 2026: { "spool-sessions": {} } },
	stow: { nvim: {}, wezterm: {}, zsh: {} },
	tmp: {},
	work: {
		clients: { "gym-brute-api": {}, inwall: {}, tiego: {} },
		eidra: { artifacts: {}, "finance-reporting": {}, slides: {}, vape: {} },
		tools: { brutebot: {}, deckhand: {} },
	},
};

/** what a folder with a `design/canvas.json` also knows: the registry's numbers */
const PROJECTS: Readonly<Record<string, { readonly frames: number; readonly opened: string }>> = {
	"personal/projects/spool": { frames: 88, opened: "today" },
	"personal/projects/spool-cloud": { frames: 0, opened: "just now" },
	"personal/projects/spool-terminal": { frames: 2, opened: "2 days ago" },
	"personal/projects/opencode-spool": { frames: 43, opened: "yesterday" },
	"personal/projects/gym-brute": { frames: 31, opened: "today" },
	"personal/projects/notaker": { frames: 7, opened: "2 days ago" },
	"personal/projects/kaffe": { frames: 8, opened: "last week" },
	"personal/projects/tretolv": { frames: 23, opened: "last week" },
	"personal/projects/droneit": { frames: 12, opened: "2 weeks ago" },
	"personal/lanes/issue-76-coffee-transition": { frames: 78, opened: "today" },
	"personal/lanes/issue-214-agent-hand": { frames: 61, opened: "yesterday" },
	"work/clients/gym-brute-api": { frames: 4, opened: "Jun 30" },
	"work/clients/inwall": { frames: 4, opened: "Jun 30" },
};

export interface Dir {
	readonly name: string;
	readonly path: string;
	readonly parent: string;
	/** a `design/canvas.json` is there: spool has something to open */
	readonly isProject: boolean;
	/** the registry's numbers, for a project spool has opened before */
	readonly frames?: number;
	readonly opened?: string;
	/** how far under home it sits: 1 is a child of `~` */
	readonly depth: number;
}

function walk(spec: Spec, parent: string, depth: number, into: Dir[]): void {
	for (const name of Object.keys(spec)) {
		const path = `${parent}/${name}`;
		const registered = PROJECTS[path.slice(HOME.length + 1)];
		into.push({
			name,
			path,
			parent,
			isProject: registered !== undefined,
			...(registered === undefined ? {} : { frames: registered.frames, opened: registered.opened }),
			depth,
		});
		walk(spec[name] ?? {}, path, depth + 1, into);
	}
}

/** every directory under home, one flat list — what a deep search actually reads */
export const DISK: readonly Dir[] = (() => {
	const out: Dir[] = [];
	walk(TREE, HOME, 1, out);
	return out;
})();

const BY_PARENT = new Map<string, Dir[]>();
for (const dir of DISK) {
	const siblings = BY_PARENT.get(dir.parent);
	if (siblings === undefined) BY_PARENT.set(dir.parent, [dir]);
	else siblings.push(dir);
}
for (const siblings of BY_PARENT.values()) siblings.sort((a, b) => a.name.localeCompare(b.name));

/** the one level a browse shows, sorted the way the daemon sorts it */
export function childrenOf(path: string): readonly Dir[] {
	return BY_PARENT.get(path) ?? [];
}

/** null at home: the picker never walks above the folder it started in */
export function parentOf(path: string): string | null {
	if (path === HOME) return null;
	const cut = path.lastIndexOf("/");
	return cut <= 0 ? null : path.slice(0, cut);
}

/** `~/personal/projects` — the only form a path is ever printed in */
export function shortPath(path: string): string {
	return path === HOME ? "~" : path.startsWith(`${HOME}/`) ? `~/${path.slice(HOME.length + 1)}` : path;
}

/** where a result sits, without repeating its own name */
export function whereIs(dir: Dir): string {
	return shortPath(dir.parent);
}

/** the folders spool already knows a project lives in: the jump row's content */
export function jumpTargets(): readonly { readonly label: string; readonly path: string }[] {
	const seen = new Map<string, number>();
	for (const dir of DISK) {
		if (!dir.isProject) continue;
		seen.set(dir.parent, (seen.get(dir.parent) ?? 0) + 1);
	}
	return [
		{ label: "~", path: HOME },
		...[...seen.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([path]) => ({ label: shortPath(path), path })),
	];
}
