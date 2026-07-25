import { expect, it } from "vitest";
import {
	type BoundedFileReadOps,
	BoundedFileTooLargeError,
	type FileReadBudget,
	type FileStat,
	readBoundedRegularFile,
	UnsafeFileReadError,
} from "./check-file";

const regular = (ino: number): FileStat => ({
	dev: 7,
	ino,
	isFile: () => true,
});

const nonRegular = (ino: number): FileStat => ({
	dev: 7,
	ino,
	isFile: () => false,
});

function fakeOps(options: {
	before?: FileStat;
	opened?: FileStat;
	after?: FileStat;
	chunks?: string[];
	openError?: NodeJS.ErrnoException;
}) {
	const state = {
		closeCalls: 0,
		flags: 0,
		readCalls: 0,
		statCalls: 0,
	};
	const chunks = [...(options.chunks ?? [])];
	const ops: BoundedFileReadOps = {
		readOnlyFlag: 1,
		nonBlockingFlag: 2,
		noFollowFlag: 4,
		lstat() {
			state.statCalls += 1;
			return state.statCalls === 1 ? (options.before ?? regular(1)) : (options.after ?? regular(1));
		},
		open(_file, flags) {
			state.flags = flags;
			if (options.openError !== undefined) throw options.openError;
			return 11;
		},
		fstat() {
			return options.opened ?? regular(1);
		},
		read(_descriptor, buffer, offset, length) {
			state.readCalls += 1;
			const chunk = chunks.shift();
			if (chunk === undefined) return 0;
			const bytes = Buffer.from(chunk);
			bytes.copy(buffer, offset, 0, Math.min(bytes.length, length));
			return Math.min(bytes.length, length);
		},
		close() {
			state.closeCalls += 1;
		},
	};
	return { ops, state };
}

function recordingBudget(maxFileBytes: number) {
	const reservations: Array<[string, number]> = [];
	const budget: FileReadBudget = {
		maxFileBytes,
		reserve(file, bytes) {
			reservations.push([file, bytes]);
		},
	};
	return { budget, reservations };
}

it("opens without following the final path and rejects an opened identity mismatch before reading", () => {
	const { ops, state } = fakeOps({ before: regular(1), opened: regular(2) });
	const { budget, reservations } = recordingBudget(8);

	expect(() => readBoundedRegularFile("frame.tsx", budget, ops)).toThrow(UnsafeFileReadError);
	expect(state.flags).toBe(1 | 2 | 4);
	expect(state.readCalls).toBe(0);
	expect(state.closeCalls).toBe(1);
	expect(reservations).toEqual([]);
});

it("rejects a path identity changed after open before reading", () => {
	const { ops, state } = fakeOps({ before: regular(1), opened: regular(1), after: regular(2) });
	const { budget } = recordingBudget(8);

	expect(() => readBoundedRegularFile("frame.tsx", budget, ops)).toThrow(UnsafeFileReadError);
	expect(state.readCalls).toBe(0);
	expect(state.closeCalls).toBe(1);
});

it("maps a regular path replaced by a socket during open to a safe refusal", () => {
	const openError = new Error("socket open failed") as NodeJS.ErrnoException;
	openError.code = "ENXIO";
	const { ops, state } = fakeOps({
		before: regular(1),
		after: nonRegular(2),
		openError,
	});
	const { budget } = recordingBudget(8);

	expect(() => readBoundedRegularFile("frame.tsx", budget, ops)).toThrow(UnsafeFileReadError);
	expect(state.readCalls).toBe(0);
	expect(state.closeCalls).toBe(0);
});

it("bounds concurrent growth and never reserves oversized bytes", () => {
	const { ops, state } = fakeOps({ chunks: ["abc", "de", "ignored"] });
	const { budget, reservations } = recordingBudget(4);

	expect(() => readBoundedRegularFile("frame.tsx", budget, ops)).toThrow(BoundedFileTooLargeError);
	expect(state.readCalls).toBe(2);
	expect(state.closeCalls).toBe(1);
	expect(reservations).toEqual([]);
});

it("reserves the bytes actually read before returning the bound descriptor contents", () => {
	const { ops, state } = fakeOps({ chunks: ["ab", "c"] });
	const { budget, reservations } = recordingBudget(8);

	const contents = readBoundedRegularFile("frame.tsx", budget, ops);

	expect(contents.toString("utf8")).toBe("abc");
	expect(reservations).toEqual([["frame.tsx", 3]]);
	expect(state.closeCalls).toBe(1);
});
