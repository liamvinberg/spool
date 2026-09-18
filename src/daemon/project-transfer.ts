import { constants, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { crc32, inflateRawSync } from "node:zlib";
import { zipSync } from "fflate";
import { readRegistry, registerProject } from "../registry";
import { FORMAT_VERSION } from "../templates";
import { parseOrder } from "./canvas-order";
import { parsePlaces } from "./canvas-places";
import { realDesignDir } from "./design-path";

export const TRANSFER_LIMITS = { compressedBytes: 128 * 1024 * 1024, expandedBytes: 512 * 1024 * 1024, entries: 10000 };
export type TransferLimits = typeof TRANSFER_LIMITS;
export class TransferError extends Error {}
const manifestPath = "spool-manifest.json";
const excluded = new Set(["node_modules"]);

function portable(path: string): boolean {
	const segments = path.split("/");
	return (
		(path === "design/canvas.json" || path.startsWith("design/frames/") || path.startsWith("design/shared/")) &&
		segments.every(
			(segment) =>
				segment.length > 0 &&
				!segment.startsWith(".") &&
				!excluded.has(segment) &&
				!/[\\:]/.test(segment) &&
				[...segment].every((character) => character.charCodeAt(0) >= 32) &&
				!/[. ]$/.test(segment),
		)
	);
}
function safeEntry(path: string): boolean {
	return path === manifestPath || portable(path);
}
function fail(message: string): never {
	throw new TransferError(message);
}
function canvas(bytes: Uint8Array): Uint8Array {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(bytes).toString("utf8"));
	} catch {
		return fail("The project canvas is not valid JSON.");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return fail("The project canvas is invalid.");
	const fields = value as Record<string, unknown>;
	if (fields.format !== FORMAT_VERSION) fail("This project canvas version is not supported.");
	return Buffer.from(
		JSON.stringify({
			format: FORMAT_VERSION,
			history: false,
			order: parseOrder(fields.order),
			places: parsePlaces(fields.places),
		}),
	);
}

export async function exportProject(
	root: string,
	spoolDir: string,
	signal?: AbortSignal,
	limits = TRANSFER_LIMITS,
): Promise<Uint8Array> {
	if (!readRegistry(spoolDir).projects.some((project) => project.root === root))
		fail("This project is not registered.");
	const design = realDesignDir(root);
	const files: Record<string, Uint8Array> = Object.create(null);
	const directories: string[] = [];
	let total = 0;
	async function walk(directory: string, relative: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			signal?.throwIfAborted();
			const path = `${relative}/${entry.name}`;
			if (!portable(path)) continue;
			const full = join(directory, entry.name);
			if (entry.isSymbolicLink()) fail(`Cannot export symbolic link: ${path}`);
			if (entry.isDirectory()) {
				directories.push(path);
				if (directories.length + Object.keys(files).length + 2 > limits.entries)
					fail("The project has too many entries.");
				await walk(full, path);
				continue;
			}
			if (!entry.isFile()) fail(`Cannot export special file: ${path}`);
			const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
			try {
				const stat = await handle.stat();
				total += stat.size;
				if (total > limits.expandedBytes || Object.keys(files).length + 2 > limits.entries)
					fail("The project exceeds the transfer size limit.");
				files[path] = await handle.readFile();
			} finally {
				await handle.close();
			}
		}
	}
	const marker = await open(join(design, "canvas.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		if ((await marker.stat()).size > limits.expandedBytes) fail("The project exceeds the transfer size limit.");
		files["design/canvas.json"] = canvas(await marker.readFile());
	} finally {
		await marker.close();
	}
	for (const folder of ["frames", "shared"]) {
		const full = join(design, folder);
		try {
			const stat = await lstat(full);
			if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`Cannot export ${folder}.`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		await walk(full, `design/${folder}`);
	}
	files[manifestPath] = Buffer.from(
		JSON.stringify({
			format: "spool-project",
			version: 1,
			name: basename(root),
			files: Object.keys(files),
			directories,
		}),
	);
	const expanded = Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0);
	if (expanded > limits.expandedBytes || Object.keys(files).length + directories.length > limits.entries)
		fail("The project exceeds the transfer size limit.");
	signal?.throwIfAborted();
	const archive = zipSync(files, { level: 0 });
	if (archive.length > limits.compressedBytes) fail("The project exceeds the transfer size limit.");
	return archive;
}

/** Read central and local headers before inflation, rejecting ambiguous names and filesystem types. */
async function unpack(
	bytes: Uint8Array,
	signal: AbortSignal | undefined,
	limits: TransferLimits,
): Promise<Map<string, Uint8Array>> {
	if (bytes.length > limits.compressedBytes) fail("The archive exceeds the compressed size limit.");
	const data = Buffer.from(bytes);
	try {
		let end = data.length - 22;
		while (end >= Math.max(0, data.length - 65557) && data.readUInt32LE(end) !== 0x06054b50) end--;
		if (end < 0 || data.readUInt32LE(end) !== 0x06054b50 || end + 22 + data.readUInt16LE(end + 20) !== data.length)
			fail("The archive is corrupt.");
		const count = data.readUInt16LE(end + 10);
		if (data.readUInt32LE(end + 4) !== 0 || data.readUInt16LE(end + 8) !== count)
			fail("Split archives are not supported.");
		if (count > limits.entries) fail("The archive has too many entries.");
		let offset = data.readUInt32LE(end + 16);
		const central = offset;
		if (central + data.readUInt32LE(end + 12) !== end) fail("The archive is corrupt.");
		let expanded = 0;
		const entries: { name: string; size: number; compressed: number; start: number; crc: number; method: number }[] =
			[];
		const seen = new Set<string>();
		const spellings = new Map<string, string>();
		const ranges: { start: number; end: number }[] = [];
		const decoder = new TextDecoder("utf-8", { fatal: true });
		for (let index = 0; index < count; index++) {
			if (data.readUInt32LE(offset) !== 0x02014b50) fail("The archive is corrupt.");
			const flags = data.readUInt16LE(offset + 8);
			const method = data.readUInt16LE(offset + 10);
			const size = data.readUInt32LE(offset + 24);
			const compressed = data.readUInt32LE(offset + 20);
			const nameLength = data.readUInt16LE(offset + 28);
			const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
			const type = (data.readUInt32LE(offset + 38) >>> 16) & 0xf000;
			if ((type !== 0 && type !== 0x8000) || (data.readUInt32LE(offset + 38) & 0x10) !== 0)
				fail("Archive links and special files are not allowed.");
			if ((flags & ~0x808) !== 0 || (method !== 0 && method !== 8) || data.readUInt16LE(offset + 34) !== 0)
				fail("Unsupported archive entry.");
			if (!safeEntry(name)) fail(`The archive contains an unsupported path: ${name}`);
			const key = name.normalize("NFC").toLowerCase();
			if (seen.has(key)) fail("The archive contains colliding paths.");
			seen.add(key);
			let prefix = "";
			for (const segment of name.split("/")) {
				prefix = prefix ? `${prefix}/${segment}` : segment;
				const folded = prefix.normalize("NFC").toLowerCase();
				const previous = spellings.get(folded);
				if (previous !== undefined && previous !== prefix) fail("The archive contains colliding paths.");
				spellings.set(folded, prefix);
			}
			expanded += size;
			if (expanded > limits.expandedBytes) fail("The archive exceeds the expanded size limit.");
			const local = data.readUInt32LE(offset + 42);
			const localLength = data.readUInt16LE(local + 26);
			if (
				data.readUInt32LE(local) !== 0x04034b50 ||
				data.readUInt16LE(local + 6) !== flags ||
				data.readUInt16LE(local + 8) !== method ||
				decoder.decode(data.subarray(local + 30, local + 30 + localLength)) !== name
			)
				fail("The archive is corrupt.");
			if (
				(flags & 8) === 0 &&
				(data.readUInt32LE(local + 14) !== data.readUInt32LE(offset + 16) ||
					data.readUInt32LE(local + 18) !== compressed ||
					data.readUInt32LE(local + 22) !== size)
			)
				fail("The archive is corrupt.");
			const start = local + 30 + localLength + data.readUInt16LE(local + 28);
			if (start + compressed > central) fail("The archive is corrupt.");
			let localEnd = start + compressed;
			if ((flags & 8) !== 0) {
				const descriptor = data.readUInt32LE(localEnd) === 0x08074b50 ? localEnd + 4 : localEnd;
				if (
					descriptor + 12 > central ||
					data.readUInt32LE(descriptor) !== data.readUInt32LE(offset + 16) ||
					data.readUInt32LE(descriptor + 4) !== compressed ||
					data.readUInt32LE(descriptor + 8) !== size
				)
					fail("The archive is corrupt.");
				localEnd = descriptor + 12;
			}
			ranges.push({ start: local, end: localEnd });
			entries.push({ name, size, compressed, start, crc: data.readUInt32LE(offset + 16), method });
			offset += 46 + nameLength + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
		}
		if (offset !== end) fail("The archive is corrupt.");
		ranges.sort((a, b) => a.start - b.start);
		for (let index = 1; index < ranges.length; index++)
			if ((ranges[index]?.start ?? 0) < (ranges[index - 1]?.end ?? 0))
				fail("The archive contains overlapping entries.");
		for (const key of seen) {
			let parent = key;
			while (parent.includes("/")) {
				parent = parent.slice(0, parent.lastIndexOf("/"));
				if (seen.has(parent)) fail("The archive contains colliding paths.");
			}
		}
		const files = new Map<string, Uint8Array>();
		for (const entry of entries) {
			await yieldTurn();
			signal?.throwIfAborted();
			const compressed = data.subarray(entry.start, entry.start + entry.compressed);
			const content =
				entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) });
			if (content.length !== entry.size || crc32(content) !== entry.crc) fail("The archive is corrupt.");
			files.set(entry.name, content);
		}
		return files;
	} catch (error) {
		if (error instanceof TransferError || signal?.aborted) throw error;
		return fail("The archive is corrupt.");
	}
}

export async function importProject(
	bytes: Uint8Array,
	location: string,
	spoolDir: string,
	signal?: AbortSignal,
	limits = TRANSFER_LIMITS,
): Promise<{ root: string; name: string }> {
	const files = await unpack(bytes, signal, limits);
	let manifest: unknown;
	try {
		manifest = JSON.parse(Buffer.from(files.get(manifestPath) ?? []).toString("utf8"));
	} catch {
		fail("This is not a Spool project archive.");
	}
	if (typeof manifest !== "object" || manifest === null) fail("This is not a Spool project archive.");
	const fields = manifest as Record<string, unknown>;
	if (fields.format !== "spool-project" || fields.version !== 1) fail("This Spool archive version is not supported.");
	if (
		typeof fields.name !== "string" ||
		!Array.isArray(fields.files) ||
		fields.files.length !== files.size - 1 ||
		new Set(fields.files).size !== fields.files.length ||
		!fields.files.every((path) => typeof path === "string" && path !== manifestPath && files.has(path))
	)
		fail("The archive manifest is invalid.");
	const marker = files.get("design/canvas.json");
	if (marker === undefined) fail("The archive has no project canvas.");
	files.set("design/canvas.json", canvas(marker));
	files.delete(manifestPath);
	const directories = fields.directories ?? [];
	if (
		!Array.isArray(directories) ||
		directories.length + files.size + 1 > limits.entries ||
		!directories.every((path) => typeof path === "string" && portable(path) && path !== "design/canvas.json")
	)
		fail("The archive directories are invalid.");
	const names = new Map<string, string>();
	const fileNames = new Set([...files.keys()].map((path) => path.normalize("NFC").toLowerCase()));
	for (const path of [...files.keys(), ...(directories as string[])]) {
		let prefix = "";
		for (const part of path.split("/")) {
			prefix = prefix ? `${prefix}/${part}` : part;
			const key = prefix.normalize("NFC").toLowerCase();
			if ((names.has(key) && names.get(key) !== prefix) || (prefix !== path && fileNames.has(key)))
				fail("The archive contains colliding paths.");
			names.set(key, prefix);
		}
		if (directories.includes(path) && fileNames.has(path.normalize("NFC").toLowerCase()))
			fail("The archive contains colliding paths.");
	}
	const name =
		fields.name
			.normalize("NFKC")
			.replace(/[^\p{L}\p{N} _-]/gu, "-")
			.trim()
			.slice(0, 80) || "Imported project";
	const parent = resolve(
		location === "~" ? homedir() : location.startsWith("~/") ? join(homedir(), location.slice(2)) : location,
	);
	await mkdir(parent, { recursive: true });
	const temporary = await mkdtemp(join(parent, ".spool-import-"));
	let destination: string | undefined;
	let committed = false;
	try {
		await mkdir(join(temporary, "design/frames"), { recursive: true });
		await mkdir(join(temporary, "design/shared"), { recursive: true });
		for (const path of directories as string[]) {
			signal?.throwIfAborted();
			await mkdir(join(temporary, path), { recursive: true });
		}
		for (const [path, content] of files) {
			signal?.throwIfAborted();
			const target = join(temporary, path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, content, { flag: "wx" });
		}
		await yieldTurn();
		signal?.throwIfAborted();
		// Reservation, installation and registry mutation are one synchronous commit.
		// Cancellation can run before it or after it, never halfway through it.
		for (let suffix = 1; ; suffix++) {
			const candidate = join(parent, suffix === 1 ? name : `${name} ${suffix}`);
			try {
				mkdirSync(candidate);
				destination = candidate;
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		}
		renameSync(join(temporary, "design"), join(destination, "design"));
		const root = realpathSync(destination);
		rmSync(temporary, { recursive: true, force: true });
		registerProject(spoolDir, root);
		committed = true;
		return { root, name: basename(root) };
	} finally {
		if (!committed && destination !== undefined) rmSync(destination, { recursive: true, force: true });
		await rm(temporary, { recursive: true, force: true });
	}
}
