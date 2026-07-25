import { existsSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { isPromise, isProxy } from "node:util/types";
import { SpoolError } from "./errors";
import { type MachineStateLockPhase, machineStateTestAdapter } from "./machine-state";

const WAIT_MS = 10;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

type MachineStateTestOperation =
	| { kind: "hold-register"; root: string; ready: string; release: string }
	| { kind: "register-when-available"; root: string; waiting: string }
	| { kind: "stall-before-claim"; root: string; ready: string; release: string }
	| { kind: "die-holding"; ready: string }
	| { kind: "die-reaping"; root: string; ready: string }
	| { kind: "die-before-reaper-claim"; root: string; ready: string }
	| { kind: "die-after-reaper-claim-cleanup"; root: string; ready: string }
	| { kind: "stall-before-reaper-claim"; root: string; ready: string; release: string; claimed: string }
	| { kind: "hold-after-reaper-proof"; root: string; proofed: string; release: string }
	| { kind: "hold-remove"; root: string; ready: string; release: string }
	| { kind: "open-session-when-available"; root: string; waiting: string }
	| { kind: "die-after-session-prune"; root: string; ready: string }
	| {
			kind: "replace-root-after-session-prune";
			root: string;
			movedRoot: string;
			replacementRoot: string;
	  };

/** Closed, data-only phase controls for cross-process lock tests. */
export function runMachineStateTestOperation(spoolDir: string, value: MachineStateTestOperation): unknown {
	const operation = normalizeMachineStateTestOperation(value);
	if (operation === undefined) throw new SpoolError("invalid machine-state test operation");
	switch (operation.kind) {
		case "hold-register":
			return machineStateTestAdapter.lock(spoolDir, () => {
				writeFileSync(operation.ready, "ready");
				waitForFile(operation.release);
				machineStateTestAdapter.registerProject(spoolDir, operation.root);
			});
		case "register-when-available":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("waiting", () => writeFileSync(operation.waiting, "waiting")),
			);
		case "stall-before-claim":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("owner-ready", () => {
					writeFileSync(operation.ready, "ready");
					waitForFile(operation.release);
				}),
			);
		case "die-holding":
			return machineStateTestAdapter.lock(spoolDir, () => {
				writeFileSync(operation.ready, "ready");
				process.exit(0);
			});
		case "die-reaping":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("reaper-claimed", () => {
					writeFileSync(operation.ready, "ready");
					process.exit(0);
				}),
			);
		case "die-before-reaper-claim":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("reaper-ready", () => {
					writeFileSync(operation.ready, "ready");
					process.exit(0);
				}),
			);
		case "die-after-reaper-claim-cleanup":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("reaper-claim-cleaned", () => {
					writeFileSync(operation.ready, "cleaned");
					process.exit(0);
				}),
			);
		case "stall-before-reaper-claim":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				(phase) => {
					if (phase === "reaper-ready") {
						writeFileSync(operation.ready, "ready");
						waitForFile(operation.release);
					}
					if (phase === "reaper-claimed") writeFileSync(operation.claimed, "claimed");
				},
			);
		case "hold-after-reaper-proof":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.registerProject(spoolDir, operation.root),
				atPhase("reaper-proofed", () => {
					writeFileSync(operation.proofed, "proofed");
					waitForFile(operation.release);
				}),
			);
		case "hold-remove":
			return machineStateTestAdapter.lock(spoolDir, () => {
				writeFileSync(operation.ready, "ready");
				waitForFile(operation.release);
				machineStateTestAdapter.removeProject(spoolDir, operation.root);
			});
		case "open-session-when-available":
			return machineStateTestAdapter.lock(
				spoolDir,
				() => machineStateTestAdapter.updateSession(spoolDir, operation.root, true),
				atPhase("waiting", () => writeFileSync(operation.waiting, "waiting")),
			);
		case "die-after-session-prune":
			return machineStateTestAdapter.lock(spoolDir, () =>
				machineStateTestAdapter.removeProject(
					spoolDir,
					operation.root,
					atPhase("session-pruned", () => {
						writeFileSync(operation.ready, "ready");
						process.exit(0);
					}),
				),
			);
		case "replace-root-after-session-prune":
			return machineStateTestAdapter.lock(spoolDir, () => {
				const result = machineStateTestAdapter.removeProject(
					spoolDir,
					operation.root,
					atPhase("session-pruned", () => {
						renameSync(operation.root, operation.movedRoot);
						symlinkSync(operation.replacementRoot, operation.root);
					}),
				);
				return { root: result.root, removed: result.removed };
			});
	}
}

function normalizeMachineStateTestOperation(value: unknown): MachineStateTestOperation | undefined {
	const operation = plainDataRecord(value);
	if (operation === undefined) return undefined;
	const kind = dataValue(operation, "kind");
	switch (kind) {
		case "hold-register":
		case "stall-before-claim":
		case "hold-remove":
			return operationWithStrings(operation, kind, ["ready", "release", "root"]);
		case "register-when-available":
		case "open-session-when-available":
			return operationWithStrings(operation, kind, ["root", "waiting"]);
		case "die-holding":
			return operationWithStrings(operation, kind, ["ready"]);
		case "die-reaping":
		case "die-before-reaper-claim":
		case "die-after-reaper-claim-cleanup":
		case "die-after-session-prune":
			return operationWithStrings(operation, kind, ["ready", "root"]);
		case "stall-before-reaper-claim":
			return operationWithStrings(operation, kind, ["claimed", "ready", "release", "root"]);
		case "hold-after-reaper-proof":
			return operationWithStrings(operation, kind, ["proofed", "release", "root"]);
		case "replace-root-after-session-prune":
			return operationWithStrings(operation, kind, ["movedRoot", "replacementRoot", "root"]);
		default:
			return undefined;
	}
}

function operationWithStrings<Operation extends MachineStateTestOperation>(
	descriptors: Record<string, PropertyDescriptor>,
	kind: Operation["kind"],
	fields: readonly string[],
): Operation | undefined {
	if (!hasExactDataKeys(descriptors, ["kind", ...fields])) return undefined;
	const operation: Record<string, string> = { kind };
	for (const field of fields) {
		const value = dataValue(descriptors, field);
		if (typeof value !== "string") return undefined;
		operation[field] = value;
	}
	return operation as Operation;
}

function plainDataRecord(value: unknown): Record<string, PropertyDescriptor> | undefined {
	if (
		typeof value !== "object" ||
		value === null ||
		isProxy(value) ||
		isPromise(value) ||
		Object.getPrototypeOf(value) !== Object.prototype ||
		Object.getOwnPropertySymbols(value).length !== 0
	) {
		return undefined;
	}
	return Object.getOwnPropertyDescriptors(value);
}

function hasExactDataKeys(descriptors: Record<string, PropertyDescriptor>, expected: readonly string[]): boolean {
	const keys = Object.keys(descriptors);
	return keys.length === expected.length && expected.every((key) => Object.hasOwn(descriptors, key));
}

function dataValue(descriptors: Record<string, PropertyDescriptor>, key: string): unknown {
	const descriptor = descriptors[key];
	return descriptor !== undefined && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function waitForFile(file: string): void {
	while (!existsSync(file)) Atomics.wait(sleeper, 0, 0, WAIT_MS);
}

function atPhase(target: MachineStateLockPhase, action: () => void): (phase: MachineStateLockPhase) => void {
	return (phase) => {
		if (phase === target) action();
	};
}
