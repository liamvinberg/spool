import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

export interface FileStat {
	dev: number | bigint;
	ino: number | bigint;
	isFile(): boolean;
}

export interface FileReadBudget {
	maxFileBytes: number;
	reserve(file: string, bytes: number): void;
}

export interface BoundedFileReadOps {
	readOnlyFlag: number;
	nonBlockingFlag: number;
	noFollowFlag: number;
	lstat(file: string): FileStat;
	open(file: string, flags: number): number;
	fstat(descriptor: number): FileStat;
	read(descriptor: number, buffer: Buffer, offset: number, length: number, position: number): number;
	close(descriptor: number): void;
}

export class UnsafeFileReadError extends Error {}

export class BoundedFileTooLargeError extends Error {}

const systemFileReadOps: BoundedFileReadOps = {
	readOnlyFlag: constants.O_RDONLY,
	nonBlockingFlag: constants.O_NONBLOCK,
	noFollowFlag: constants.O_NOFOLLOW ?? 0,
	lstat: lstatSync,
	open: openSync,
	fstat: fstatSync,
	read: readSync,
	close: closeSync,
};

function sameIdentity(left: FileStat, right: FileStat): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function changedDuringOpen(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ELOOP" || code === "ENOENT" || code === "ENOTDIR" || code === "ENXIO" || code === "ENODEV";
}

function pathIdentityChanged(file: string, before: FileStat, ops: BoundedFileReadOps): boolean {
	try {
		const current = ops.lstat(file);
		return !current.isFile() || !sameIdentity(before, current);
	} catch {
		return true;
	}
}

export function readBoundedRegularFile(
	file: string,
	budget: FileReadBudget,
	ops: BoundedFileReadOps = systemFileReadOps,
	validatePath: () => void = () => {},
): Buffer {
	const before = ops.lstat(file);
	if (!before.isFile()) throw new UnsafeFileReadError();
	let descriptor: number;
	try {
		descriptor = ops.open(file, ops.readOnlyFlag | ops.nonBlockingFlag | ops.noFollowFlag);
	} catch (error) {
		if (changedDuringOpen(error) || pathIdentityChanged(file, before, ops)) throw new UnsafeFileReadError();
		throw error;
	}
	try {
		const opened = ops.fstat(descriptor);
		if (!opened.isFile() || !sameIdentity(before, opened)) throw new UnsafeFileReadError();
		validatePath();
		let after: FileStat;
		try {
			after = ops.lstat(file);
		} catch {
			throw new UnsafeFileReadError();
		}
		if (!after.isFile() || !sameIdentity(opened, after)) throw new UnsafeFileReadError();

		const chunks: Buffer[] = [];
		const scratch = Buffer.allocUnsafe(Math.min(64 * 1024, budget.maxFileBytes + 1));
		let bytesRead = 0;
		while (bytesRead <= budget.maxFileBytes) {
			const remaining = budget.maxFileBytes + 1 - bytesRead;
			const count = ops.read(descriptor, scratch, 0, Math.min(scratch.length, remaining), bytesRead);
			if (count === 0) break;
			if (count < 0 || count > Math.min(scratch.length, remaining)) throw new UnsafeFileReadError();
			chunks.push(Buffer.from(scratch.subarray(0, count)));
			bytesRead += count;
		}
		if (bytesRead > budget.maxFileBytes) throw new BoundedFileTooLargeError();
		budget.reserve(file, bytesRead);
		return chunks.length === 1 ? (chunks[0] as Buffer) : Buffer.concat(chunks, bytesRead);
	} finally {
		ops.close(descriptor);
	}
}
