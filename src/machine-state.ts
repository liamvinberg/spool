import { join, resolve } from "node:path";
import { isPromise, isProxy } from "node:util/types";
import { writeAtomic } from "./atomic-write";
import { SpoolError } from "./errors";
import { type FileLockPhase, withFileLockSync } from "./file-lock";
import { type AppSession, type Registry, readMachineRegistry, readMachineSession } from "./machine-state-files";
import { type ProjectRename, renameProjectUnlocked } from "./rename-project";

const LOCK_FILE = "machine-state.lock";
export type MachineStateLockPhase = FileLockPhase;
type MachineStateLockObserver = (phase: MachineStateLockPhase) => void;

export type MachineProjectRemoval = {
	root: string;
	removed: boolean;
	registry: Registry;
	session: AppSession;
	sessionChanged: boolean;
};

export type SessionMutationResult = { kind: "written"; session: AppSession } | { kind: "unregistered"; root: string };

export type MachineStateMutation =
	| { kind: "write-session"; session: AppSession }
	| { kind: "register-project"; root: string }
	| { kind: "register-and-open-project"; root: string }
	| { kind: "update-session"; root: string; open: boolean }
	| { kind: "order-session"; order: readonly string[] }
	| { kind: "remove-project"; root: string }
	| { kind: "rename-project"; root: string; name: string; bundled?: string }
	/** one local setting on a registered project (#281); `undefined` takes the key out */
	| { kind: "set-project-setting"; root: string; path: readonly string[]; value: unknown };

export type MachineStateMutationResult<Mutation extends MachineStateMutation> = Mutation extends {
	kind: "update-session";
}
	? SessionMutationResult
	: Mutation extends { kind: "order-session" }
		? AppSession
		: Mutation extends { kind: "remove-project" }
			? MachineProjectRemoval
			: Mutation extends { kind: "rename-project" }
				? ProjectRename
				: Mutation extends { kind: "set-project-setting" }
					? { kind: "written" } | { kind: "unregistered"; root: string }
					: undefined;

/**
 * Execute one closed registry/session operation across spool processes.
 * Runtime validation happens before lock acquisition; callback-shaped casts
 * are rejected without ever being invoked.
 */
export function mutateMachineState<Mutation extends MachineStateMutation>(
	spoolDir: string,
	mutation: Mutation,
): MachineStateMutationResult<Mutation> {
	const normalized = normalizeMachineStateMutation(mutation);
	if (normalized === undefined) {
		throw new SpoolError("invalid machine-state mutation");
	}
	return withMachineStateLock(spoolDir, () =>
		executeMachineStateMutation(spoolDir, normalized),
	) as MachineStateMutationResult<Mutation>;
}

function withMachineStateLock<T>(spoolDir: string, mutation: () => T, observe?: MachineStateLockObserver): T {
	const lockFile = join(resolve(spoolDir), LOCK_FILE);
	return withFileLockSync(lockFile, mutation, observe);
}

function executeMachineStateMutation(spoolDir: string, mutation: MachineStateMutation): unknown {
	switch (mutation.kind) {
		case "write-session":
			writeMachineSession(spoolDir, mutation.session);
			return;
		case "register-project":
			registerProjectUnlocked(spoolDir, mutation.root);
			return;
		case "register-and-open-project": {
			const registry = readMachineRegistry(spoolDir);
			const session = readMachineSession(spoolDir);
			registerProjectUnlocked(spoolDir, mutation.root, registry);
			if (!session.open.includes(mutation.root)) {
				writeMachineSession(spoolDir, { open: [...session.open, mutation.root] });
			}
			return;
		}
		case "update-session":
			return updateSessionUnlocked(spoolDir, mutation.root, mutation.open);
		case "order-session":
			return orderSessionUnlocked(spoolDir, mutation.order);
		case "remove-project":
			return removeProjectUnlocked(spoolDir, mutation.root);
		case "rename-project":
			return renameProjectUnlocked(spoolDir, mutation.root, mutation.name, mutation.bundled);
		case "set-project-setting":
			return setProjectSettingUnlocked(spoolDir, mutation.root, mutation.path, mutation.value);
	}
}

function setProjectSettingUnlocked(
	spoolDir: string,
	root: string,
	path: readonly string[],
	value: unknown,
): { kind: "written" } | { kind: "unregistered"; root: string } {
	const registry = readMachineRegistry(spoolDir);
	const project = registry.projects.find((candidate) => candidate.root === root);
	if (project === undefined) return { kind: "unregistered", root };
	const settings = setNested(project.settings ?? {}, path, value);
	if (Object.keys(settings).length === 0) delete project.settings;
	else project.settings = settings;
	writeMachineRegistry(spoolDir, registry);
	return { kind: "written" };
}

/** `a.b` set into `{ a: { b } }`, carrying every other key through; `undefined` removes and prunes. */
export function setNested(
	held: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): Record<string, unknown> {
	const [head, ...rest] = path;
	if (head === undefined) return held;
	const next = { ...held };
	if (rest.length === 0) {
		if (value === undefined) delete next[head];
		else next[head] = value;
		return next;
	}
	const inner = next[head];
	const child = setNested(
		typeof inner === "object" && inner !== null && !Array.isArray(inner) ? (inner as Record<string, unknown>) : {},
		rest,
		value,
	);
	if (Object.keys(child).length === 0) delete next[head];
	else next[head] = child;
	return next;
}

/** `a.b` read out of `{ a: { b } }`; anything missing on the way is `undefined`. */
export function getNested(held: unknown, path: readonly string[]): unknown {
	let cursor: unknown = held;
	for (const step of path) {
		if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) return undefined;
		cursor = (cursor as Record<string, unknown>)[step];
	}
	return cursor;
}

function registerProjectUnlocked(spoolDir: string, root: string, registry = readMachineRegistry(spoolDir)): void {
	const openedAt = new Date().toISOString();
	const existing = registry.projects.find((project) => project.root === root);
	if (existing === undefined) {
		registry.projects.push({ root, openedAt });
	} else {
		existing.openedAt = openedAt;
	}
	writeMachineRegistry(spoolDir, registry);
}

function writeMachineRegistry(spoolDir: string, registry: Registry): void {
	writeAtomic(join(spoolDir, "registry.json"), `${JSON.stringify(registry, null, "\t")}\n`);
}

function writeMachineSession(spoolDir: string, session: AppSession): void {
	writeAtomic(join(spoolDir, "session.json"), `${JSON.stringify(session, null, "\t")}\n`);
}

function unregisterProjectUnlocked(
	spoolDir: string,
	root: string,
	registry = readMachineRegistry(spoolDir),
): { root: string; removed: boolean; registry: Registry } {
	if (!registry.projects.some((project) => project.root === root)) {
		return { root, removed: false, registry };
	}
	const next = {
		...registry,
		projects: registry.projects.filter((project) => project.root !== root),
	};
	writeMachineRegistry(spoolDir, next);
	return { root, removed: true, registry: next };
}

function updateSessionUnlocked(spoolDir: string, root: string, open: boolean): SessionMutationResult {
	const registered = new Set(readMachineRegistry(spoolDir).projects.map((project) => project.root));
	if (open && !registered.has(root)) return { kind: "unregistered", root };
	const session = readMachineSession(spoolDir);
	const next = open ? [...new Set([...session.open, root])] : session.open.filter((candidate) => candidate !== root);
	if (next.length !== session.open.length) writeMachineSession(spoolDir, { open: next });
	return { kind: "written", session: { open: next } };
}

/**
 * Arrange the open tabs, without opening or closing one.
 *
 * The list somebody dragged is a claim about the tabs that page can see, so it
 * only ever reorders what is already open: a root it names that has since been
 * closed is dropped, and a tab opened somewhere else while the drag was in the
 * hand keeps its place at the end rather than being closed by an arrangement
 * that never knew about it.
 */
function orderSessionUnlocked(spoolDir: string, order: readonly string[]): AppSession {
	const session = readMachineSession(spoolDir);
	const held = new Set(session.open);
	const wanted = [...new Set(order)].filter((root) => held.has(root));
	const rest = session.open.filter((root) => !wanted.includes(root));
	const next = [...wanted, ...rest];
	if (next.some((root, index) => root !== session.open[index])) writeMachineSession(spoolDir, { open: next });
	return { open: next };
}

function removeProjectUnlocked(spoolDir: string, root: string, afterSessionPruned?: () => void): MachineProjectRemoval {
	const session = readMachineSession(spoolDir);
	const registry = readMachineRegistry(spoolDir);
	const open = session.open.filter((candidate) => candidate !== root);
	const sessionChanged = open.length !== session.open.length;
	if (sessionChanged) writeMachineSession(spoolDir, { open });
	afterSessionPruned?.();
	return {
		...unregisterProjectUnlocked(spoolDir, root, registry),
		session: { open },
		sessionChanged,
	};
}

interface MachineStateTestAdapter {
	lock<T>(spoolDir: string, mutation: () => T, observe?: MachineStateLockObserver): T;
	registerProject(spoolDir: string, root: string): void;
	updateSession(spoolDir: string, root: string, open: boolean): SessionMutationResult;
	removeProject(spoolDir: string, root: string, observe?: MachineStateLockObserver): MachineProjectRemoval;
}

/** @internal Narrow phase adapter; all file/process orchestration lives in the test-only harness. */
export const machineStateTestAdapter: MachineStateTestAdapter = {
	lock: withMachineStateLock,
	registerProject: registerProjectUnlocked,
	updateSession: updateSessionUnlocked,
	removeProject: (spoolDir, root, observe) => removeProjectUnlocked(spoolDir, root, () => observe?.("session-pruned")),
};

function normalizeMachineStateMutation(value: unknown): MachineStateMutation | undefined {
	const mutation = plainDataRecord(value);
	if (mutation === undefined) return undefined;
	const kind = dataValue(mutation, "kind");
	switch (kind) {
		case "write-session": {
			if (!hasExactDataKeys(mutation, ["kind", "session"])) return undefined;
			const session = normalizeSession(dataValue(mutation, "session"));
			return session === undefined ? undefined : { kind, session };
		}
		case "register-project":
		case "register-and-open-project":
		case "remove-project": {
			if (!hasExactDataKeys(mutation, ["kind", "root"])) return undefined;
			const root = dataValue(mutation, "root");
			return typeof root === "string" ? { kind, root } : undefined;
		}
		case "update-session": {
			if (!hasExactDataKeys(mutation, ["kind", "open", "root"])) return undefined;
			const root = dataValue(mutation, "root");
			const open = dataValue(mutation, "open");
			return typeof root === "string" && typeof open === "boolean" ? { kind, root, open } : undefined;
		}
		case "rename-project": {
			if (
				!hasExactDataKeys(mutation, ["kind", "name", "root"]) &&
				!hasExactDataKeys(mutation, ["kind", "name", "root", "bundled"])
			)
				return undefined;
			const bundled = dataValue(mutation, "bundled");
			if (bundled !== undefined && (typeof bundled !== "string" || !/^[0-9a-f-]{36}$/i.test(bundled)))
				return undefined;
			const root = dataValue(mutation, "root");
			const name = dataValue(mutation, "name");
			return typeof root === "string" && typeof name === "string"
				? { kind, root, name, ...(typeof bundled === "string" ? { bundled } : {}) }
				: undefined;
		}
		case "order-session": {
			if (!hasExactDataKeys(mutation, ["kind", "order"])) return undefined;
			const order = normalizeRoots(dataValue(mutation, "order"));
			return order === undefined ? undefined : { kind, order };
		}
		case "set-project-setting": {
			if (!hasExactDataKeys(mutation, ["kind", "path", "root", "value"])) return undefined;
			const root = dataValue(mutation, "root");
			const path = normalizeRoots(dataValue(mutation, "path"));
			const value = dataValue(mutation, "value");
			if (typeof root !== "string" || path === undefined || path.length === 0) return undefined;
			// a setting is a primitive or its absence; the registry never holds a shape it did not write
			if (value !== undefined && typeof value !== "boolean" && typeof value !== "string") return undefined;
			return { kind, root, path, value };
		}
		default:
			return undefined;
	}
}

function normalizeSession(value: unknown): AppSession | undefined {
	const session = plainDataRecord(value);
	if (session === undefined || !hasExactDataKeys(session, ["open"])) return undefined;
	const open = normalizeRoots(dataValue(session, "open"));
	return open === undefined ? undefined : { open };
}

/** A plain array of project roots, and nothing wearing one as a costume. */
function normalizeRoots(source: unknown): string[] | undefined {
	if (
		typeof source !== "object" ||
		source === null ||
		isProxy(source) ||
		!Array.isArray(source) ||
		Object.getPrototypeOf(source) !== Array.prototype
	) {
		return undefined;
	}
	if (Object.getOwnPropertySymbols(source).length !== 0) return undefined;
	const items = Object.getOwnPropertyDescriptors(source);
	const length = dataValue(items, "length");
	if (
		!Number.isSafeInteger(length) ||
		(length as number) < 0 ||
		Object.keys(items).length !== (length as number) + 1
	) {
		return undefined;
	}
	const roots: string[] = [];
	for (let index = 0; index < (length as number); index++) {
		const root = dataValue(items, String(index));
		if (typeof root !== "string") return undefined;
		roots.push(root);
	}
	return roots;
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
