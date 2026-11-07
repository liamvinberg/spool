import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { SpoolError } from "../../errors";
import { initProject } from "../../init";
import { readRegistry } from "../../registry";
import { figma } from "./figma";
import { type ImportSource, importSourceOf } from "./kinds";

export type { ImportSource };

import { slugOf, unique } from "./slug";

/**
 * Work brought into spool from another design tool (spool#242). Each tool has an adapter that reads what it gives
 * (a file, or later a paste or a link) into one shape every adapter shares: pages of frames, each frame an outline of
 * its layers one line a layer, with its images and icons as files. That shape lands in `imports/<slug>/` beside
 * design/, never inside it: it is material the agent reads, not frames, and nothing in it travels with the project.
 * The agent learns the one shape once (`spool skill import`), whichever tool it came from.
 */

/** One tool's reader. */
export interface ImportAdapter {
	readonly source: ImportSource;
	/** read it, or throw a SpoolError that says what to do instead; `fallbackName` names a file that names nothing */
	readonly read: (bytes: Uint8Array, fallbackName: string) => ImportRead;
}

export const ADAPTERS: readonly ImportAdapter[] = [figma];

/** The adapter for a dropped file, by its name. */
export function adapterFor(fileName: string): ImportAdapter | undefined {
	const source = importSourceOf(fileName);
	return ADAPTERS.find((adapter) => adapter.source === source);
}

export const IMPORTS = "imports";

/** One frame of an import, as the index and the agent's block name it. */
export interface ImportedFrame {
	readonly name: string;
	readonly kind: "frame" | "component";
	readonly w: number;
	readonly h: number;
	/** its outline, relative to the import's folder */
	readonly outline: string;
	/** the frames its prototype links go to, by name */
	readonly links: readonly string[];
}

export interface ImportedPage {
	readonly name: string;
	readonly frames: readonly ImportedFrame[];
}

/** What `imports/<slug>/import.json` holds: the import's index, and whether its first turn has gone. */
export interface ImportManifest {
	readonly slug: string;
	readonly name: string;
	readonly source: ImportSource;
	readonly file: string;
	readonly pages: readonly ImportedPage[];
	readonly frames: number;
	readonly links: number;
	readonly sent: boolean;
}

/** A read file: its pages, and every file its outlines name, by path relative to the import's folder. */
export interface ImportRead {
	readonly source: ImportSource;
	readonly name: string;
	readonly pages: readonly (ImportedPage & { readonly outlines: ReadonlyMap<string, string> })[];
	readonly files: ReadonlyMap<string, Uint8Array>;
}

/** The import's index, which the agent reads first: its pages and frames in Figma's order, and where each is. */
function readme(read: ImportRead, file: string): string {
	const frames = read.pages.reduce((sum, page) => sum + page.frames.length, 0);
	const lines = [
		`# ${read.name}`,
		"",
		`Read from ${file} by spool: ${count(read.pages.length, "page", "pages")}, ${count(frames, "frame", "frames")}. Each frame below is an outline file, one line a layer; \`spool skill import\` says how to read them and how to rebuild them.`,
	];
	for (const page of read.pages) {
		lines.push("", `## ${page.name}`, "");
		for (const frame of page.frames)
			lines.push(
				`- ${frame.kind === "component" ? "component " : ""}"${frame.name}" ${frame.w}×${frame.h}: ${frame.outline}${frame.links.length ? `, links to ${frame.links.map((to) => `"${to}"`).join(", ")}` : ""}`,
			);
	}
	const images = [...read.files.keys()].filter((path) => path.startsWith("images/")).length;
	const icons = [...read.files.keys()].filter((path) => path.startsWith("icons/")).length;
	if (images + icons > 0)
		lines.push(
			"",
			`Files: ${count(images, "image", "images")} in images/, ${count(icons, "icon", "icons")} in icons/.`,
		);
	return `${lines.join("\n")}\n`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Write a read file into `<root>/imports/<slug>/`, and its manifest last, so a half-written import is never listed. */
export function writeImport(root: string, read: ImportRead, file: string): ImportManifest {
	const parent = join(root, IMPORTS);
	mkdirSync(parent, { recursive: true });
	const slug = unique(slugOf(read.name, "import"), new Set(existsSync(parent) ? readdirSync(parent) : []));
	const folder = join(parent, slug);
	const write = (path: string, content: string | Uint8Array) => {
		const target = join(folder, path);
		mkdirSync(join(target, ".."), { recursive: true });
		writeFileSync(target, content);
	};
	for (const page of read.pages) for (const [path, text] of page.outlines) write(path, text);
	for (const [path, bytes] of read.files) write(path, bytes);
	write("README.md", readme(read, file));
	const manifest: ImportManifest = {
		slug,
		name: read.name,
		source: read.source,
		file,
		pages: read.pages.map(({ name, frames }) => ({ name, frames })),
		frames: read.pages.reduce((sum, page) => sum + page.frames.length, 0),
		links: read.pages.reduce((sum, page) => sum + page.frames.reduce((n, frame) => n + frame.links.length, 0), 0),
		sent: false,
	};
	write("import.json", `${JSON.stringify(manifest, null, "\t")}\n`);
	return manifest;
}

/** A project's imports, newest last, read off their manifests. */
export function readImports(root: string): ImportManifest[] {
	const parent = join(root, IMPORTS);
	if (!existsSync(parent)) return [];
	return readdirSync(parent).flatMap((slug) => {
		try {
			const manifest = JSON.parse(readFileSync(join(parent, slug, "import.json"), "utf8")) as ImportManifest;
			return manifest.slug === slug ? [manifest] : [];
		} catch {
			return [];
		}
	});
}

/**
 * What a turn carrying an import tells the agent, beside the person's words: where the import is and how to read it.
 * The import is marked sent, so a project opened again does not start it a second time. Undefined for a slug the
 * project has no import under.
 */
export function importPrompt(root: string, slug: string): string | undefined {
	const manifest = readImports(root).find((one) => one.slug === slug);
	if (manifest === undefined) return undefined;
	if (!manifest.sent)
		writeFileSync(
			join(root, IMPORTS, slug, "import.json"),
			`${JSON.stringify({ ...manifest, sent: true }, null, "\t")}\n`,
		);
	return `<import>\n${manifest.name}, from ${manifest.source}: ${IMPORTS}/${slug}/ (beside design/), ${count(manifest.pages.length, "page", "pages")}, ${count(manifest.frames, "frame", "frames")}, ${count(manifest.links, "prototype link", "prototype links")}. Read its README.md, then run \`spool skill import\` before writing a frame.\n</import>`;
}

/** The chip a person sees for an import: its name and how many frames it holds. */
export function importLabel(manifest: Pick<ImportManifest, "name" | "frames">): string {
	return `${manifest.name} · ${count(manifest.frames, "frame", "frames")}`;
}

/**
 * A dropped file as a project of its own: read first, so a file spool cannot read leaves nothing behind, then a
 * project named after what it holds in the projects location (` 2`, ` 3`… when the name is taken), the import beside
 * its design/. The project opens with its import waiting for the agent.
 */
export function importIntoNewProject(
	bytes: Uint8Array,
	fileName: string,
	location: string,
	spoolDir: string,
): { root: string; name: string; import: ImportManifest } {
	const adapter = adapterFor(fileName);
	if (adapter === undefined) throw new SpoolError("spool can't read this kind of file yet.");
	const fallback = basename(fileName).replace(/\.[^.]+$/u, "") || `${adapter.source} import`;
	const read = adapter.read(bytes, fallback);
	if (read.pages.length === 0) throw new SpoolError(`This ${adapter.source} file has no frames to bring in.`);
	const name =
		read.name
			.normalize("NFKC")
			.replace(/[^\p{L}\p{N} _-]/gu, "-")
			.trim()
			.slice(0, 80) || `${adapter.source} import`;
	const parent = resolve(
		location === "~" ? homedir() : location.startsWith("~/") ? join(homedir(), location.slice(2)) : location,
	);
	mkdirSync(parent, { recursive: true });
	const registered = new Set(
		readRegistry(spoolDir).projects.map((project) => basename(project.root).normalize("NFC").toLowerCase()),
	);
	let target: string | undefined;
	for (let suffix = 1; target === undefined; suffix++) {
		const candidate = join(parent, suffix === 1 ? name : `${name} ${suffix}`);
		if (registered.has(basename(candidate).normalize("NFC").toLowerCase())) continue;
		try {
			mkdirSync(candidate);
			target = candidate;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	try {
		const manifest = writeImport(target, read, basename(fileName));
		const { root } = initProject(target, spoolDir);
		return { root, name: basename(root), import: manifest };
	} catch (error) {
		rmSync(target, { recursive: true, force: true });
		throw error;
	}
}
