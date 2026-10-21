import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Standing } from "../open";
import { readProjectLink } from "../team-project";
import { MOVE_MESSAGE } from "./history";

/**
 * A registered project whose `design/` left git through a move commit, into a team this account can't edit
 * (spool#194): Home's cover and the canvas say where it went and who moved it. Who moved it comes from git's move
 * commit, never from spool.page, so no stranger learns who is in a team; the standing is spool.page's answer for the
 * project to this account alone.
 */
export interface MovedAway {
	/** The team's address. */
	team: string;
	/** The project's address at spool.page. */
	url: string;
	standing: Standing;
	/** The move commit, as git has it here; null when this checkout holds none. */
	commit: { hash: string; author: string; date: string } | null;
	/** The frames still in design/ that go up once this account is an editor, by name. */
	leftover: string[];
}

/** The move commit that brought this root's `spool.json` in: its hash, its author's name and when they made it. */
export function moveCommitOf(root: string): Promise<MovedAway["commit"]> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["log", "-1", "--format=%H%x00%an%x00%aI", `--grep=^${MOVE_MESSAGE}$`, "--", "spool.json"],
			{ cwd: root, encoding: "utf8" },
			(error, stdout) => {
				const [hash, author, date] = stdout.trim().split("\0");
				resolve(error === null && hash && author && date ? { hash, author, date } : null);
			},
		);
	});
}

/** The frames left in a root's `design/`: every folder under frames/ holding a frame.tsx, by its name. */
export function leftoverFrames(root: string): string[] {
	const frames = join(root, "design", "frames");
	if (!existsSync(frames)) return [];
	try {
		return readdirSync(frames, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name === "frame.tsx")
			.map((entry) => relative(frames, entry.parentPath).split(sep).join("/"))
			.filter((name) => name !== "" && !name.split("/").some((part) => part.startsWith(".")))
			.sort();
	} catch {
		return [];
	}
}

/** What a root moved away with a standing says, read now from git and the disk. */
export async function movedAway(root: string, standing: Standing): Promise<MovedAway> {
	const link = readProjectLink(root);
	return {
		team: link.team,
		url: link.url,
		standing,
		commit: await moveCommitOf(root),
		leftover: leftoverFrames(root),
	};
}

/**
 * The roots moved away from this account, as their last refill was refused. Each is asked again every so often and
 * whenever the account changes, so one made an editor fills in by itself.
 */
export function movedAwayRoots(deps: {
	/** Ask every moved-away root again: its refill is tried once more. */
	ask: () => void;
	/** A root's moved-away state changed: Home and its canvas read it again. */
	changed: (root: string) => void;
	askMs: number;
}) {
	const roots = new Map<string, MovedAway>();
	let timer: NodeJS.Timeout | undefined;
	const arm = () => {
		if (timer !== undefined || roots.size === 0) return;
		timer = setInterval(() => {
			if (roots.size === 0) {
				clearInterval(timer);
				timer = undefined;
				return;
			}
			deps.ask();
		}, deps.askMs);
		timer.unref?.();
	};
	return {
		get: (root: string): MovedAway | undefined => roots.get(root),
		async refused(root: string, standing: Standing): Promise<void> {
			const next = await movedAway(root, standing);
			const was = roots.get(root);
			roots.set(root, next);
			arm();
			if (JSON.stringify(was) !== JSON.stringify(next)) deps.changed(root);
		},
		filled(root: string): void {
			if (roots.delete(root)) deps.changed(root);
		},
		/** Only these roots are still registered: a hidden one is forgotten. */
		keeping(registered: readonly string[]): void {
			for (const root of roots.keys()) if (!registered.includes(root)) roots.delete(root);
		},
		/** The account changed: ask now. */
		account(): void {
			if (roots.size > 0) deps.ask();
		},
		close(): void {
			clearInterval(timer);
			timer = undefined;
		},
	};
}
