import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, onTestFinished } from "vitest";
import { writeAtomic } from "../atomic-write";
import { watchFolders, watchTree } from "./watch-tree";

/**
 * The one thing only a real folder can answer: does the OS keep talking?
 *
 * Every write spool makes is a `writeAtomic` — a temp file renamed over the
 * name — and on Linux that used to be the end of the conversation. Node
 * emulates a recursive watch there by watching each file, an inotify watch
 * belongs to an inode, and the rename throws the watched inode away: the first
 * edit to a frame was announced and no edit after it ever was. So the test that
 * matters is the second write, not the first.
 */

/**
 * Both shapes, everywhere: what the OS walks for us on macOS and Windows, and
 * the folder-by-folder watch every other platform falls back to. The fallback
 * is the one this is about, and holding it to these promises only where it
 * ships would hold it to them only in CI.
 */
const shapes = [
	["the platform's own", watchTree],
	["a handle per folder", watchFolders],
] as const;

function folder(): string {
	const root = mkdtempSync(join(tmpdir(), "spool-watch-"));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "frames", "cart"), { recursive: true });
	writeFileSync(join(root, "frames", "cart", "frame.tsx"), "one\n");
	return root;
}

/**
 * A live watch, and the wait for one path it has yet to report.
 *
 * Opening one is not the same as listening: kqueue and FSEvents both arm a
 * beat later, and a real watch is open long before anybody edits anything. So
 * the helper is awaited, and every test below starts from a watch that is up.
 */
async function watching(open: typeof watchTree, root: string) {
	let saw: (string | null)[] = [];
	const watch = open(
		root,
		(path) => saw.push(path),
		() => {},
	);
	onTestFinished(() => watch.close());
	await new Promise((resolve) => setTimeout(resolve, 250));
	saw = [];
	return {
		forget: () => {
			saw = [];
		},
		until: async (path: string): Promise<void> => {
			const deadline = Date.now() + 10_000;
			while (!saw.includes(path)) {
				if (Date.now() > deadline) throw new Error(`never heard ${path}, only ${JSON.stringify(saw)}`);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		},
	};
}

describe.each(shapes)("%s watch", (_shape, open) => {
	it("keeps announcing a file that atomic writes keep replacing", async () => {
		const root = folder();
		const file = join(root, "frames", "cart", "frame.tsx");
		const watch = await watching(open, root);

		for (const edit of ["two", "three", "four"]) {
			watch.forget();
			writeAtomic(file, `${edit}\n`);
			await watch.until(join("frames", "cart", "frame.tsx"));
		}
	});

	it("follows a folder that appeared after it started, and what was already inside it", async () => {
		const root = folder();
		const watch = await watching(open, root);

		// the mkdir and the write into it are one burst, and a handle that opens
		// in the middle of it has to say what it found as well as what it heard
		const made = join(root, "frames", "checkout");
		mkdirSync(made);
		writeFileSync(join(made, "frame.tsx"), "new\n");
		await watch.until(join("frames", "checkout", "frame.tsx"));

		watch.forget();
		writeAtomic(join(made, "frame.tsx"), "again\n");
		await watch.until(join("frames", "checkout", "frame.tsx"));
	});

	it("hears a frame folder renamed, and keeps hearing it under its new name", async () => {
		const root = folder();
		const watch = await watching(open, root);

		renameSync(join(root, "frames", "cart"), join(root, "frames", "basket"));
		await watch.until(join("frames", "basket"));

		watch.forget();
		writeAtomic(join(root, "frames", "basket", "frame.tsx"), "moved\n");
		await watch.until(join("frames", "basket", "frame.tsx"));
	});
});
