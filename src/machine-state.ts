import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	closeSync,
	fstatSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isPromise, isProxy } from "node:util/types";
import { writeAtomic } from "./atomic-write";
import { SpoolError } from "./errors";
import { parseLinuxProcessBirth, parsePlatformProcessBirth } from "./machine-process-identity";
import { type AppSession, type Registry, readMachineRegistry, readMachineSession } from "./machine-state-files";

const LOCK_FILE = "machine-state.lock";
const WAIT_MS = 10;
const TIMEOUT_MS = 10_000;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const held = new Set<string>();
const machineToken = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const processInspectionEnv = {
	...process.env,
	LC_ALL: "C",
	LANG: "C",
	TZ: "UTC",
} satisfies NodeJS.ProcessEnv;

interface ProcessMarker {
	token: string;
	fd: number;
	dev: string;
	ino: string;
}

interface ProcessIdentity {
	pid: number;
	birth: string;
	marker?: ProcessMarker;
}

interface LockOwner extends ProcessIdentity {
	token: string;
}

export type MachineStateLockPhase =
	| "owner-ready"
	| "reaper-ready"
	| "reaper-claimed"
	| "reaper-proofed"
	| "reaper-claim-cleaned"
	| "session-pruned"
	| "waiting";

type MachineStateLockObserver = (phase: MachineStateLockPhase) => void;

interface ReaperOwner extends ProcessIdentity {
	token: string;
}

interface FileIdentity {
	dev: string;
	ino: string;
}

interface InspectedLock {
	identity: FileIdentity;
	nlink: bigint;
	owner: { kind: "valid"; value: LockOwner } | { kind: "malformed" };
}

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
			: Mutation extends { kind: "set-project-setting" }
				? { kind: "written" } | { kind: "unregistered"; root: string }
				: undefined;

let ownBirth: string | undefined;

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
	if (held.has(lockFile)) return mutation();

	const owner = acquire(lockFile, observe);
	held.add(lockFile);
	try {
		return mutation();
	} finally {
		held.delete(lockFile);
		release(lockFile, owner);
	}
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

/**
 * Build a complete unique owner file, then hard-link it into the fixed lock
 * path. The claim is atomic and never exposes an ownerless lock.
 */
function acquire(lockFile: string, observe?: MachineStateLockObserver): LockOwner {
	mkdirSync(dirname(lockFile), { recursive: true });
	recoverAbandonedOwners(lockFile);
	recoverAbandonedReapers(lockFile);
	const owner = { ...createProcessIdentity(lockFile), token: randomUUID() } satisfies LockOwner;
	const ownerFile = ownerPath(lockFile, owner.token);
	let acquired = false;
	try {
		writeExclusive(ownerFile, owner);
		observe?.("owner-ready");

		const deadline = Date.now() + TIMEOUT_MS;
		for (;;) {
			try {
				linkSync(ownerFile, lockFile);
				acquired = true;
				return owner;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
					throw new SpoolError(`cannot lock machine state at ${lockFile}: ${(error as Error).message}`);
				}
				if (reapAbandoned(lockFile, owner, observe)) continue;
				observe?.("waiting");
				if (Date.now() >= deadline) {
					throw new SpoolError(`timed out waiting for machine state at ${lockFile}`);
				}
				Atomics.wait(sleeper, 0, 0, WAIT_MS);
			}
		}
	} finally {
		if (!acquired) {
			unlinkOwn(ownerFile, owner);
			disposeProcessIdentity(lockFile, owner);
		}
	}
}

/**
 * A process can die after publishing its private owner record but before it
 * claims the fixed path. Remove only records whose exact process instance is
 * provably gone; an incomplete record may still be in the middle of publish.
 */
function recoverAbandonedOwners(lockFile: string): void {
	const prefix = `${basename(lockFile)}.owner-`;
	let entries: string[];
	try {
		entries = readdirSync(dirname(lockFile));
	} catch (error) {
		throw new SpoolError(`cannot inspect machine-state owners at ${dirname(lockFile)}: ${(error as Error).message}`);
	}
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const ownerFile = join(dirname(lockFile), entry);
		const inspected = inspectLock(ownerFile, "machine-state owner");
		if (inspected === undefined || inspected.owner.kind === "malformed" || processMatches(inspected.owner.value)) {
			continue;
		}
		unlinkIfFile(ownerFile, inspected.identity);
		if (inspected.owner.value.marker !== undefined) {
			unlinkProcessMarker(lockFile, inspected.owner.value.marker);
		}
	}
}

/**
 * A stale owner is removed only after this process hard-links that exact
 * inode and proves it is the sole reaper. A replacement lock has a different
 * inode and can never be unlinked through the stale claim.
 */
function reapAbandoned(lockFile: string, identity: ProcessIdentity, observe?: MachineStateLockObserver): boolean {
	recoverAbandonedReapers(lockFile);
	const observed = inspectLock(lockFile, "machine-state lock");
	if (observed === undefined) return true;
	if (observed.owner.kind === "valid" && processMatches(observed.owner.value)) return false;

	const reaper = {
		...identity,
		token: randomUUID(),
	} satisfies ReaperOwner;
	const lease = reaperPath(lockFile, reaper.token);
	const claim = reaperClaimPath(lockFile, reaper.token);
	writeAtomic(lease, JSON.stringify(reaper));
	observe?.("reaper-ready");
	try {
		linkSync(lockFile, claim);
	} catch (error) {
		unlinkEntry(lease);
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw new SpoolError(`cannot claim abandoned machine state at ${lockFile}: ${(error as Error).message}`);
	}
	observe?.("reaper-claimed");
	try {
		const claimed = inspectLock(claim, "machine-state reaper claim");
		const fixed = fileIdentity(lockFile, "machine-state lock");
		if (
			claimed === undefined ||
			fixed === undefined ||
			!sameFile(claimed.identity, observed.identity) ||
			!sameFile(fixed, claimed.identity)
		) {
			return false;
		}
		const ownerLinks = linkedOwnerPaths(lockFile, observed.identity);
		if (claimed.nlink !== BigInt(ownerLinks.length + 2)) return false;
		observe?.("reaper-proofed");

		try {
			unlinkSync(lockFile);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
			throw error;
		}
		for (const ownerFile of ownerLinks) unlinkIfFile(ownerFile, observed.identity);
		if (observed.owner.kind === "valid" && observed.owner.value.marker !== undefined) {
			unlinkProcessMarker(lockFile, observed.owner.value.marker);
		}
		return true;
	} finally {
		unlinkEntry(claim);
		observe?.("reaper-claim-cleaned");
		unlinkEntry(lease);
	}
}

/**
 * Every claim path is disposable, but its complete ownership record is
 * published first. Recovery removes claims only when that exact process birth
 * is gone. A lease-less claim can only be an orphan and is safe to drop.
 */
function recoverAbandonedReapers(lockFile: string): void {
	let entries: string[];
	try {
		entries = readdirSync(dirname(lockFile));
	} catch (error) {
		throw new SpoolError(`cannot inspect machine-state reapers at ${dirname(lockFile)}: ${(error as Error).message}`);
	}
	const claimPrefix = `${basename(lockFile)}.reap-`;
	for (const entry of entries) {
		if (!entry.startsWith(claimPrefix)) continue;
		const token = entry.slice(claimPrefix.length);
		if (!isMachineToken(token)) {
			unlinkEntry(join(dirname(lockFile), entry));
			continue;
		}
		const lease = reaperPath(lockFile, token);
		const reaper = readReaper(lease, token);
		if (reaper.kind === "valid" && processMatches(reaper.value)) continue;
		unlinkEntry(join(dirname(lockFile), entry));
		if (reaper.kind !== "missing") unlinkEntry(lease);
		if (reaper.kind === "valid" && reaper.value.marker !== undefined) {
			unlinkProcessMarker(lockFile, reaper.value.marker);
		}
	}

	const reaperPrefix = `${basename(lockFile)}.reaper-`;
	for (const entry of entries) {
		if (!entry.startsWith(reaperPrefix) || !entry.endsWith(".json")) continue;
		const lease = join(dirname(lockFile), entry);
		const token = entry.slice(reaperPrefix.length, -".json".length);
		if (!isMachineToken(token)) {
			unlinkEntry(lease);
			continue;
		}
		const reaper = readReaper(lease, token);
		if (reaper.kind === "valid" && processMatches(reaper.value)) continue;
		if (reaper.kind === "valid") unlinkEntry(reaperClaimPath(lockFile, reaper.value.token));
		unlinkEntry(lease);
		if (reaper.kind === "valid" && reaper.value.marker !== undefined) {
			unlinkProcessMarker(lockFile, reaper.value.marker);
		}
	}
}

function release(lockFile: string, owner: LockOwner): void {
	try {
		const fixed = readOwner(lockFile, "machine-state lock");
		if (fixed.kind === "valid" && sameOwner(fixed.value, owner)) unlinkEntry(lockFile);
		unlinkOwn(ownerPath(lockFile, owner.token), owner);
	} finally {
		disposeProcessIdentity(lockFile, owner);
	}
}

function unlinkOwn(file: string, owner: LockOwner): void {
	const found = readOwner(file, "machine-state owner");
	if (found.kind === "valid" && sameOwner(found.value, owner)) unlinkEntry(file);
}

function unlinkEntry(file: string): void {
	try {
		unlinkSync(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function linkedOwnerPaths(lockFile: string, identity: FileIdentity): string[] {
	const prefix = `${basename(lockFile)}.owner-`;
	let entries: string[];
	try {
		entries = readdirSync(dirname(lockFile));
	} catch (error) {
		throw new SpoolError(`cannot inspect machine-state owners at ${dirname(lockFile)}: ${(error as Error).message}`);
	}
	return entries
		.filter((entry) => entry.startsWith(prefix))
		.map((entry) => join(dirname(lockFile), entry))
		.filter((file) => {
			const found = fileIdentity(file, "machine-state owner");
			return found !== undefined && sameFile(found, identity);
		});
}

function unlinkIfFile(file: string, identity: FileIdentity): void {
	const found = fileIdentity(file, "machine-state owner");
	if (found !== undefined && sameFile(found, identity)) unlinkEntry(file);
}

function fileIdentity(file: string, label: string): FileIdentity | undefined {
	try {
		const stats = statSync(file, { bigint: true });
		return { dev: stats.dev.toString(), ino: stats.ino.toString() };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw new SpoolError(`cannot inspect ${label} at ${file}: ${(error as Error).message}`);
	}
}

function inspectLock(file: string, label: string): InspectedLock | undefined {
	let fd: number;
	try {
		fd = openSync(file, "r");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw new SpoolError(`cannot read ${label} at ${file}: ${(error as Error).message}`);
	}
	try {
		const raw = readFileSync(fd, "utf8");
		const stats = fstatSync(fd, { bigint: true });
		const parsed = parseOwner(raw);
		return {
			identity: { dev: stats.dev.toString(), ino: stats.ino.toString() },
			nlink: stats.nlink,
			owner: parsed === undefined ? { kind: "malformed" } : { kind: "valid", value: parsed },
		};
	} catch (error) {
		throw new SpoolError(`cannot read ${label} at ${file}: ${(error as Error).message}`);
	} finally {
		closeSync(fd);
	}
}

function ownerPath(lockFile: string, token: string): string {
	return artifactPath(lockFile, "owner", token);
}

function reaperPath(lockFile: string, token: string): string {
	return `${artifactPath(lockFile, "reaper", token)}.json`;
}

function reaperClaimPath(lockFile: string, token: string): string {
	return artifactPath(lockFile, "reap", token);
}

function processMarkerPath(lockFile: string, token: string): string {
	return artifactPath(lockFile, "process", token);
}

function artifactPath(lockFile: string, kind: "owner" | "reaper" | "reap" | "process", token: string): string {
	if (!isMachineToken(token)) throw new SpoolError(`invalid machine-state ${kind} token`);
	return `${lockFile}.${kind}-${token}`;
}

function isMachineToken(value: unknown): value is string {
	return typeof value === "string" && machineToken.test(value);
}

function sameFile(left: FileIdentity, right: FileIdentity): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function createProcessIdentity(lockFile: string): ProcessIdentity {
	ownBirth ??= processBirth(process.pid);
	if (ownBirth === undefined) throw new SpoolError(`cannot identify current process ${process.pid}`);
	if (process.platform !== "darwin") return { pid: process.pid, birth: ownBirth };

	const token = randomUUID();
	const markerFile = processMarkerPath(lockFile, token);
	const fd = openSync(markerFile, "wx");
	try {
		const stats = fstatSync(fd, { bigint: true });
		return {
			pid: process.pid,
			birth: ownBirth,
			marker: { token, fd, dev: stats.dev.toString(), ino: stats.ino.toString() },
		};
	} catch (error) {
		closeSync(fd);
		unlinkEntry(markerFile);
		throw error;
	}
}

function disposeProcessIdentity(lockFile: string, identity: ProcessIdentity): void {
	if (identity.marker === undefined) return;
	try {
		closeSync(identity.marker.fd);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
	}
	unlinkProcessMarker(lockFile, identity.marker);
}

function unlinkProcessMarker(lockFile: string, marker: ProcessMarker): void {
	const markerFile = processMarkerPath(lockFile, marker.token);
	const found = fileIdentity(markerFile, "machine-state process marker");
	if (found !== undefined && sameFile(found, marker)) unlinkEntry(markerFile);
}

function processMatches(owner: ProcessIdentity): boolean {
	if (processBirth(owner.pid) !== owner.birth) return false;
	if (process.platform !== "darwin") return true;
	return owner.marker !== undefined && darwinProcessOwnsMarker(owner.pid, owner.marker);
}

function darwinProcessOwnsMarker(pid: number, marker: ProcessMarker): boolean {
	try {
		const output = execFileSync("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", String(marker.fd), "-F", "pDfi"], {
			encoding: "utf8",
			env: processInspectionEnv,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const device = output.match(/^D(0x[0-9a-f]+)$/im)?.[1];
		const inode = output.match(/^i(\d+)$/m)?.[1];
		return (
			output.includes(`p${pid}\n`) &&
			output.includes(`f${marker.fd}\n`) &&
			device !== undefined &&
			BigInt(device).toString() === marker.dev &&
			inode !== undefined &&
			BigInt(inode).toString() === marker.ino
		);
	} catch (error) {
		if (!pidExists(pid)) return false;
		const failure = error as Error & { status?: number; stderr?: string | Buffer };
		const stderr = typeof failure.stderr === "string" ? failure.stderr : failure.stderr?.toString("utf8");
		if (failure.status === 1 && (stderr === undefined || stderr.trim() === "")) return false;
		throw new SpoolError(`cannot inspect process marker for ${pid}: ${failure.message}`);
	}
}

function processBirth(pid: number): string | undefined {
	if (process.platform === "linux") return linuxProcessBirth(pid);

	const executable = process.platform === "win32" ? "powershell.exe" : "/bin/ps";
	const args =
		process.platform === "win32"
			? [
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					`$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $p) { exit 3 }; $p.StartTime.ToUniversalTime().Ticks`,
				]
			: ["-p", String(pid), "-o", "lstart="];
	try {
		const output = execFileSync(executable, args, {
			encoding: "utf8",
			env: processInspectionEnv,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const birth = parsePlatformProcessBirth(process.platform, output);
		if (birth !== undefined) return birth;
	} catch (error) {
		if (!pidExists(pid)) return undefined;
		throw new SpoolError(`cannot inspect process ${pid}: ${(error as Error).message}`);
	}
	if (!pidExists(pid)) return undefined;
	throw new SpoolError(`cannot inspect process ${pid}: no birth identity returned`);
}

function linuxProcessBirth(pid: number): string | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8");
		if (boot.trim() === "") throw new SpoolError("cannot identify the current Linux boot");
		const birth = parseLinuxProcessBirth(stat, boot);
		if (birth === undefined) throw new SpoolError(`cannot inspect process ${pid}: malformed /proc stat`);
		return birth;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		if (error instanceof SpoolError) throw error;
		throw new SpoolError(`cannot inspect process ${pid}: ${(error as Error).message}`);
	}
}

function pidExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
		throw new SpoolError(`cannot inspect process ${pid}: ${(error as Error).message}`);
	}
}

type OwnerRead = { kind: "missing" } | { kind: "malformed" } | { kind: "valid"; value: LockOwner };

function readOwner(file: string, label: string): OwnerRead {
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
		throw new SpoolError(`cannot read ${label} at ${file}: ${(error as Error).message}`);
	}
	const owner = parseOwner(raw);
	return owner === undefined ? { kind: "malformed" } : { kind: "valid", value: owner };
}

function parseOwner(raw: string): LockOwner | undefined {
	try {
		const value = JSON.parse(raw) as Partial<LockOwner>;
		const identity = parseProcessIdentity(value);
		return identity !== undefined && isMachineToken(value.token) ? { ...identity, token: value.token } : undefined;
	} catch {
		return undefined;
	}
}

function parseProcessIdentity(value: Partial<ProcessIdentity>): ProcessIdentity | undefined {
	if (
		!Number.isInteger(value.pid) ||
		(value.pid as number) <= 0 ||
		typeof value.birth !== "string" ||
		value.birth === ""
	) {
		return undefined;
	}
	const marker = parseProcessMarker(value.marker);
	if (process.platform === "darwin" && marker === undefined) return undefined;
	return {
		pid: value.pid as number,
		birth: value.birth,
		...(marker === undefined ? {} : { marker }),
	};
}

function parseProcessMarker(value: unknown): ProcessMarker | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const marker = value as Partial<ProcessMarker>;
	if (
		!isMachineToken(marker.token) ||
		!Number.isInteger(marker.fd) ||
		(marker.fd as number) < 0 ||
		!isDecimalIdentity(marker.dev) ||
		!isDecimalIdentity(marker.ino)
	) {
		return undefined;
	}
	return {
		token: marker.token,
		fd: marker.fd as number,
		dev: marker.dev,
		ino: marker.ino,
	};
}

function isDecimalIdentity(value: unknown): value is string {
	return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

type ReaperRead = { kind: "missing" } | { kind: "malformed" } | { kind: "valid"; value: ReaperOwner };

function readReaper(file: string, expectedToken: string): ReaperRead {
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
		throw new SpoolError(`cannot read machine-state reaper at ${file}: ${(error as Error).message}`);
	}
	try {
		const value = JSON.parse(raw) as Partial<ReaperOwner>;
		const identity = parseProcessIdentity(value);
		if (identity === undefined || !isMachineToken(expectedToken) || value.token !== expectedToken) {
			return { kind: "malformed" };
		}
		return {
			kind: "valid",
			value: { ...identity, token: value.token },
		};
	} catch {
		return { kind: "malformed" };
	}
}

function writeExclusive(file: string, value: LockOwner): void {
	const fd = openSync(file, "wx");
	try {
		writeFileSync(fd, JSON.stringify(value));
	} finally {
		closeSync(fd);
	}
}

function sameOwner(left: LockOwner, right: LockOwner): boolean {
	return left.pid === right.pid && left.birth === right.birth && left.token === right.token;
}
