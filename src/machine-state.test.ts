import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { readSession, watchMachineState, writeSession } from "./daemon/session";
import { createMachineStateWatchHarness } from "./daemon/session-test-harness";
import { SpoolError } from "./errors";
import { type MachineStateMutation, type MachineStateMutationResult, mutateMachineState } from "./machine-state";
import { runMachineStateTestOperation } from "./machine-state-test-harness";
import { readRegistry, registerProject } from "./registry";
import { makeTempDir } from "./test-helpers";

function machineStateMutationTypeContract<Mutation extends MachineStateMutation>(
	mutation: Mutation,
): MachineStateMutationResult<Mutation> {
	return mutateMachineState("/tmp/spool", mutation);
}

function nestedMachineStateMutationTypeContract<Mutation extends MachineStateMutation>(
	mutation: Mutation,
): MachineStateMutationResult<Mutation> {
	return machineStateMutationTypeContract(mutation);
}

function rejectedMachineStateCallbackTypeContract(): void {
	// @ts-expect-error Machine-state accepts closed operations, never callbacks.
	void mutateMachineState("/tmp/spool", async () => undefined);
}
void machineStateMutationTypeContract;
void nestedMachineStateMutationTypeContract;
void rejectedMachineStateCallbackTypeContract;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

interface Worker {
	child: ChildProcessWithoutNullStreams;
	output: () => string;
	done: Promise<number | null>;
}

describe("machine state mutations", () => {
	it("serializes concurrent project registration across processes", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const first = realpathSync(makeTempDir());
		const second = realpathSync(makeTempDir());
		const ready = join(harness.dir, "holder-ready");
		const release = join(harness.dir, "release-holder");
		const waiting = join(harness.dir, "contender-waiting");
		const done = join(harness.dir, "contender-done");

		const holder = harness.start(["hold-register", spoolDir, first, ready, release]);
		await waitForFile(ready, holder);
		const contender = harness.start(["register-when-available", spoolDir, second, waiting, done]);
		await waitForFile(waiting, contender);

		writeFileSync(release, "go");
		await expectWorkerSuccess(holder);
		await expectWorkerSuccess(contender);

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([first, second]);
	});

	it.each(["before-subscribe", "after-subscribe"] as const)("reconciles a %s watcher write exactly once", (phase) => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const events: string[] = [];
		const watchHarness = createMachineStateWatchHarness({
			...(phase === "before-subscribe"
				? { beforeSubscribe: () => registerProject(spoolDir, root) }
				: {
						afterSubscribe: (changed) => {
							registerProject(spoolDir, root);
							changed("registry.json");
						},
					}),
		});

		const watcher = watchMachineState(spoolDir, (event) => events.push(event.kind), {
			adapter: watchHarness.adapter,
		});
		onTestFinished(() => watcher.stop());
		watchHarness.flush();

		expect(events).toEqual(["registry"]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("rejects callback-shaped casts before any async continuation can start", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const marker = join(makeTempDir(), "late-write");
		const promiseMarker = join(makeTempDir(), "late-promise-write");
		let releaseGate = (): void => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		let started = false;
		let promiseStarted = false;
		const unchecked = mutateMachineState as (dir: string, mutation: () => Promise<void>) => void;

		expect(() =>
			unchecked(spoolDir, async () => {
				started = true;
				await gate;
				writeFileSync(marker, "too late");
			}),
		).toThrow("invalid machine-state mutation");
		expect(() =>
			unchecked(spoolDir, () => {
				promiseStarted = true;
				return gate.then(() => {
					writeFileSync(promiseMarker, "too late");
				});
			}),
		).toThrow("invalid machine-state mutation");
		registerProject(spoolDir, root);
		releaseGate();
		await gate;
		await Promise.resolve();

		expect(started).toBe(false);
		expect(promiseStarted).toBe(false);
		expect(existsSync(marker)).toBe(false);
		expect(existsSync(promiseMarker)).toBe(false);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("normalizes closed mutations without invoking exotic input", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const marker = join(makeTempDir(), "late-exotic-write");
		let releaseGate = (): void => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		let getterRan = false;
		const getterOperation: MachineStateMutation = {
			get kind(): "register-project" {
				getterRan = true;
				void gate.then(() => writeFileSync(marker, "getter"));
				return "register-project";
			},
			get root(): string {
				getterRan = true;
				return root;
			},
		};
		expect(() => mutateMachineState(spoolDir, getterOperation)).toThrow("invalid machine-state mutation");

		const decoratedPromise = Object.assign(Promise.resolve(), {
			kind: "register-project" as const,
			root,
		});
		expect(() => mutateMachineState(spoolDir, decoratedPromise)).toThrow("invalid machine-state mutation");

		let thenableRan = false;
		const thenableSource = {
			kind: "register-project" as const,
			root,
		};
		const thenProperty = ["th", "en"].join("");
		Object.defineProperty(thenableSource, thenProperty, {
			enumerable: true,
			value: () => {
				thenableRan = true;
			},
		});
		const thenable: MachineStateMutation = thenableSource;
		expect(() => mutateMachineState(spoolDir, thenable)).toThrow("invalid machine-state mutation");

		let proxyTrapRan = false;
		const proxy: MachineStateMutation = new Proxy({ kind: "register-project", root } as const, {
			get: (target, property, receiver) => {
				proxyTrapRan = true;
				return Reflect.get(target, property, receiver);
			},
			getOwnPropertyDescriptor: (target, property) => {
				proxyTrapRan = true;
				return Reflect.getOwnPropertyDescriptor(target, property);
			},
			getPrototypeOf: (target) => {
				proxyTrapRan = true;
				return Reflect.getPrototypeOf(target);
			},
			ownKeys: (target) => {
				proxyTrapRan = true;
				return Reflect.ownKeys(target);
			},
		});
		expect(() => mutateMachineState(spoolDir, proxy)).toThrow("invalid machine-state mutation");

		let sessionGetterRan = false;
		const sessionOperation: MachineStateMutation = {
			kind: "write-session",
			session: {
				get open(): string[] {
					sessionGetterRan = true;
					return [root];
				},
			},
		};
		expect(() => mutateMachineState(spoolDir, sessionOperation)).toThrow("invalid machine-state mutation");

		const accessorRoots = [root];
		Object.defineProperty(accessorRoots, "0", {
			get: () => {
				sessionGetterRan = true;
				return root;
			},
		});
		expect(() =>
			mutateMachineState(spoolDir, {
				kind: "write-session",
				session: { open: accessorRoots },
			}),
		).toThrow("invalid machine-state mutation");
		let nestedProxyTrapRan = false;
		const sessionProxy = new Proxy(
			{ open: [root] },
			{
				get: (target, property, receiver) => {
					nestedProxyTrapRan = true;
					return Reflect.get(target, property, receiver);
				},
				getOwnPropertyDescriptor: (target, property) => {
					nestedProxyTrapRan = true;
					return Reflect.getOwnPropertyDescriptor(target, property);
				},
			},
		);
		expect(() =>
			mutateMachineState(spoolDir, {
				kind: "write-session",
				session: sessionProxy,
			}),
		).toThrow("invalid machine-state mutation");
		expect(() =>
			mutateMachineState(spoolDir, {
				kind: "write-session",
				session: { open: Array(1) as string[] },
			}),
		).toThrow("invalid machine-state mutation");

		const symbol = Symbol("extra");
		expect(() =>
			mutateMachineState(spoolDir, {
				kind: "register-project",
				root,
				[symbol]: true,
			}),
		).toThrow("invalid machine-state mutation");
		expect(() =>
			mutateMachineState(
				spoolDir,
				Object.assign(Object.create({ inherited: true }) as object, {
					kind: "register-project" as const,
					root,
				}) as MachineStateMutation,
			),
		).toThrow("invalid machine-state mutation");

		expect(getterRan).toBe(false);
		expect(thenableRan).toBe(false);
		expect(proxyTrapRan).toBe(false);
		expect(sessionGetterRan).toBe(false);
		expect(nestedProxyTrapRan).toBe(false);
		expect(existsSync(spoolDir)).toBe(false);

		releaseGate();
		await gate;
		await Promise.resolve();
		expect(existsSync(marker)).toBe(false);

		mutateMachineState(spoolDir, Object.freeze({ kind: "register-project" as const, root }));
		mutateMachineState(
			spoolDir,
			Object.freeze({
				kind: "write-session" as const,
				session: Object.freeze({ open: Object.freeze([root]) }),
			}) as unknown as MachineStateMutation,
		);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
		expect(readSession(spoolDir)).toEqual({ open: [root] });
	});

	it("rejects a revoked session array before acquiring the lock", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const revoked = Proxy.revocable([root], {});
		revoked.revoke();
		let failure: unknown;

		try {
			mutateMachineState(spoolDir, {
				kind: "write-session",
				session: { open: revoked.proxy },
			});
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(SpoolError);
		expect((failure as Error).message).toBe("invalid machine-state mutation");
		expect(existsSync(spoolDir)).toBe(false);
	});

	it("normalizes closed machine-state test operations before reading them", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const marker = join(makeTempDir(), "late-test-operation-write");
		let releaseGate = (): void => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		let getterRan = false;
		const unchecked = runMachineStateTestOperation as (dir: string, operation: unknown) => unknown;
		const operation = {
			get kind(): "die-holding" {
				getterRan = true;
				void gate.then(() => writeFileSync(marker, "getter"));
				return "die-holding";
			},
			ready: join(makeTempDir(), "ready"),
		};
		expect(() => unchecked(spoolDir, operation)).toThrow("invalid machine-state test operation");

		let proxyTrapRan = false;
		const proxy = new Proxy(
			{ kind: "die-holding", ready: join(makeTempDir(), "ready") },
			{
				get: (target, property, receiver) => {
					proxyTrapRan = true;
					return Reflect.get(target, property, receiver);
				},
				getOwnPropertyDescriptor: (target, property) => {
					proxyTrapRan = true;
					return Reflect.getOwnPropertyDescriptor(target, property);
				},
			},
		);
		expect(() => unchecked(spoolDir, proxy)).toThrow("invalid machine-state test operation");
		expect(() =>
			unchecked(
				spoolDir,
				Object.assign(Promise.resolve(), {
					kind: "die-holding",
					ready: join(makeTempDir(), "ready"),
				}),
			),
		).toThrow("invalid machine-state test operation");
		let thenableRan = false;
		const testThenable = {
			kind: "die-holding",
			ready: join(makeTempDir(), "ready"),
		};
		const thenProperty = ["th", "en"].join("");
		Object.defineProperty(testThenable, thenProperty, {
			enumerable: true,
			value: () => {
				thenableRan = true;
			},
		});
		expect(() => unchecked(spoolDir, testThenable)).toThrow("invalid machine-state test operation");
		expect(getterRan).toBe(false);
		expect(proxyTrapRan).toBe(false);
		expect(thenableRan).toBe(false);
		expect(existsSync(spoolDir)).toBe(false);

		releaseGate();
		await gate;
		await Promise.resolve();
		expect(existsSync(marker)).toBe(false);
	});

	it.runIf(process.platform === "darwin")(
		"keeps the lock exclusive across process timezone and locale environments",
		{ timeout: 15_000 },
		async () => {
			const harness = makeHarness();
			const spoolDir = join(makeTempDir(), ".spool");
			const first = realpathSync(makeTempDir());
			const second = realpathSync(makeTempDir());
			const ready = join(harness.dir, "holder-ready");
			const release = join(harness.dir, "release-holder");
			const waiting = join(harness.dir, "contender-waiting");
			const done = join(harness.dir, "contender-done");
			const locale = alternateLocale();

			const holder = harness.start(["hold-register", spoolDir, first, ready, release], {
				LC_ALL: "C",
				LANG: "C",
				TZ: "UTC",
			});
			await waitForFile(ready, holder);
			const contender = harness.start(["register-when-available", spoolDir, second, waiting, done], {
				LC_ALL: locale,
				LANG: locale,
				TZ: "Pacific/Honolulu",
			});

			expect(await waitForEither(waiting, done, contender)).toBe(waiting);
			writeFileSync(release, "go");
			await expectWorkerSuccess(holder);
			await expectWorkerSuccess(contender);

			expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([first, second]);
		},
	);

	it.runIf(process.platform === "darwin")(
		"serializes exact process-marker file identities as decimal strings",
		{ timeout: 15_000 },
		async () => {
			const harness = makeHarness();
			const spoolDir = join(makeTempDir(), ".spool");
			const root = realpathSync(makeTempDir());
			const ready = join(harness.dir, "owner-ready");
			const release = join(harness.dir, "release-owner");
			const owner = harness.start(["stall-before-claim", spoolDir, root, ready, release]);
			await waitForFile(ready, owner);
			const ownerFile = readdirSync(spoolDir).find((entry) => entry.includes(".owner-"));
			expect(ownerFile).toBeDefined();
			const record = JSON.parse(readFileSync(join(spoolDir, ownerFile as string), "utf8")) as {
				marker: { token: string; dev: unknown; ino: unknown };
			};
			const markerStats = statSync(join(spoolDir, `machine-state.lock.process-${record.marker.token}`), {
				bigint: true,
			});

			expect(record.marker.dev).toBe(markerStats.dev.toString());
			expect(record.marker.ino).toBe(markerStats.ino.toString());

			writeFileSync(release, "go");
			await expectWorkerSuccess(owner);
		},
	);

	it("publishes no lock until its owner is complete", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const stalled = realpathSync(makeTempDir());
		const winner = realpathSync(makeTempDir());
		const ready = join(harness.dir, "owner-ready");
		const release = join(harness.dir, "release-owner");
		const done = join(harness.dir, "winner-done");
		const started = join(harness.dir, "winner-started");

		const owner = harness.start(["stall-before-claim", spoolDir, stalled, ready, release]);
		await waitForFile(ready, owner);
		const contender = harness.start(["register", spoolDir, winner, started, done]);
		await expectWorkerSuccess(contender);

		writeFileSync(release, "go");
		await expectWorkerSuccess(owner);

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([winner, stalled]);
	});

	it("reaps a lock left by a dead owner", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const ready = join(harness.dir, "dead-owner-ready");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ready]);
		await waitForFile(ready, abandoned);
		await expectWorkerSuccess(abandoned);

		const contender = harness.start(["register", spoolDir, root, started, done]);
		await expectWorkerSuccess(contender);

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("reaps an owner whose PID belongs to a different process birth", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		const owner = {
			pid: process.pid,
			birth: "a previous process instance",
			token: "00000000-0000-4000-8000-000000000010",
			marker: { token: "00000000-0000-4000-8000-000000000011", fd: 999_998, dev: "0", ino: "0" },
		};
		const lockFile = join(spoolDir, "machine-state.lock");
		mkdirSync(spoolDir, { recursive: true });
		const ownerFile = `${lockFile}.owner-${owner.token}`;
		writeFileSync(ownerFile, JSON.stringify(owner));
		linkSync(ownerFile, lockFile);
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const contender = harness.start(["register", spoolDir, root, started, done]);
		await expectWorkerSuccess(contender);

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("never follows a stale process-marker token outside the spool directory", () => {
		const parent = makeTempDir();
		const spoolDir = join(parent, ".spool");
		const root = realpathSync(makeTempDir());
		const victim = join(parent, "victim");
		const externalMarker = join(parent, "marker");
		writeFileSync(victim, "keep");
		linkSync(victim, externalMarker);

		const lockFile = join(spoolDir, "machine-state.lock");
		const owner = {
			pid: process.pid,
			birth: "a previous process instance",
			token: "00000000-0000-4000-8000-000000000000",
			marker: {
				token: "../../../marker",
				fd: 999_998,
				dev: statSync(victim, { bigint: true }).dev.toString(),
				ino: statSync(victim, { bigint: true }).ino.toString(),
			},
		};
		mkdirSync(join(spoolDir, "machine-state.lock.process-.."), { recursive: true });
		const ownerFile = `${lockFile}.owner-${owner.token}`;
		writeFileSync(ownerFile, JSON.stringify(owner));
		linkSync(ownerFile, lockFile);

		registerProject(spoolDir, root);

		expect(readFileSync(victim, "utf8")).toBe("keep");
		expect(readFileSync(externalMarker, "utf8")).toBe("keep");
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it.runIf(process.platform === "darwin")(
		"reaps a same-second PID reuse that does not own the original process marker",
		{ timeout: 15_000 },
		async () => {
			const harness = makeHarness();
			const spoolDir = join(makeTempDir(), ".spool");
			const root = realpathSync(makeTempDir());
			const startedAt = execFileSync("/bin/ps", ["-p", String(process.pid), "-o", "lstart="], {
				encoding: "utf8",
				env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
			}).trim();
			const owner = {
				pid: process.pid,
				birth: `darwin:${startedAt}`,
				token: "00000000-0000-4000-8000-000000000012",
				marker: { token: "00000000-0000-4000-8000-000000000013", fd: 999_999, dev: "0", ino: "0" },
			};
			const lockFile = join(spoolDir, "machine-state.lock");
			mkdirSync(spoolDir, { recursive: true });
			const ownerFile = `${lockFile}.owner-${owner.token}`;
			writeFileSync(ownerFile, JSON.stringify(owner));
			linkSync(ownerFile, lockFile);
			const started = join(harness.dir, "contender-started");
			const done = join(harness.dir, "contender-done");

			const contender = harness.start(["register", spoolDir, root, started, done]);
			await expectWorkerSuccess(contender);

			expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
		},
	);

	it("reaps malformed fixed-lock metadata through the inode proof", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "machine-state.lock"), "{not an owner");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const contender = harness.start(["register", spoolDir, root, started, done]);
		await expectWorkerSuccess(contender);

		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([root]);
	});

	it("surfaces direct fixed-lock filesystem errors without timing out", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const root = realpathSync(makeTempDir());
		mkdirSync(join(spoolDir, "machine-state.lock"), { recursive: true });

		expect(() => registerProject(spoolDir, root)).toThrow(/cannot read machine-state lock/);
		expect(readRegistry(spoolDir).projects).toEqual([]);
	});

	it("does not delete a live proof when its ownership record cannot be read", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const heldRoot = realpathSync(makeTempDir());
		const contenderRoot = realpathSync(makeTempDir());
		const ready = join(harness.dir, "holder-ready");
		const release = join(harness.dir, "release-holder");
		const holder = harness.start(["hold-register", spoolDir, heldRoot, ready, release]);
		await waitForFile(ready, holder);
		const lockFile = join(spoolDir, "machine-state.lock");
		const token = "00000000-0000-4000-8000-000000000001";
		const claim = `${lockFile}.reap-${token}`;
		linkSync(lockFile, claim);
		mkdirSync(`${lockFile}.reaper-${token}.json`);

		expect(() => registerProject(spoolDir, contenderRoot)).toThrow(/cannot read machine-state reaper/);
		expect(existsSync(claim)).toBe(true);

		writeFileSync(release, "go");
		await expectWorkerSuccess(holder);
	});

	it("recovers when a reaper dies after claiming a stale lock", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const interrupted = realpathSync(makeTempDir());
		const recovered = realpathSync(makeTempDir());
		const ownerReady = join(harness.dir, "dead-owner-ready");
		const reaperReady = join(harness.dir, "dead-reaper-ready");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ownerReady]);
		await waitForFile(ownerReady, abandoned);
		await expectWorkerSuccess(abandoned);

		const reaper = harness.start(["die-reaping", spoolDir, interrupted, reaperReady]);
		await waitForFile(reaperReady, reaper);
		await expectWorkerSuccess(reaper);

		const contender = harness.start(["register", spoolDir, recovered, started, done]);
		await expectWorkerSuccess(contender);

		expect(lockArtifacts(spoolDir)).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([recovered]);
	});

	it("recovers when a reaper dies before creating its claim", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const interrupted = realpathSync(makeTempDir());
		const recovered = realpathSync(makeTempDir());
		const ownerReady = join(harness.dir, "dead-owner-ready");
		const reaperReady = join(harness.dir, "dead-reaper-ready");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ownerReady]);
		await waitForFile(ownerReady, abandoned);
		await expectWorkerSuccess(abandoned);

		const reaper = harness.start(["die-before-reaper-claim", spoolDir, interrupted, reaperReady]);
		await waitForFile(reaperReady, reaper);
		await expectWorkerSuccess(reaper);

		const contender = harness.start(["register", spoolDir, recovered, started, done]);
		await expectWorkerSuccess(contender);

		expect(lockArtifacts(spoolDir)).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([recovered]);
	});

	it("recovers when a reaper dies after cleaning its claim", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const interrupted = realpathSync(makeTempDir());
		const recovered = realpathSync(makeTempDir());
		const ownerReady = join(harness.dir, "dead-owner-ready");
		const claimCleaned = join(harness.dir, "claim-cleaned");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ownerReady]);
		await waitForFile(ownerReady, abandoned);
		await expectWorkerSuccess(abandoned);

		const reaper = harness.start(["die-after-reaper-claim-cleanup", spoolDir, interrupted, claimCleaned]);
		await waitForFile(claimCleaned, reaper);
		await expectWorkerSuccess(reaper);

		const contender = harness.start(["register", spoolDir, recovered, started, done]);
		await expectWorkerSuccess(contender);

		expect(lockArtifacts(spoolDir)).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([recovered]);
	});

	it("recovers a lease-less reaper claim without weakening the fixed lock", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const recovered = realpathSync(makeTempDir());
		const ownerReady = join(harness.dir, "dead-owner-ready");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ownerReady]);
		await waitForFile(ownerReady, abandoned);
		await expectWorkerSuccess(abandoned);
		const lockFile = join(spoolDir, "machine-state.lock");
		linkSync(lockFile, `${lockFile}.reap-orphan-without-lease`);

		const contender = harness.start(["register", spoolDir, recovered, started, done]);
		await expectWorkerSuccess(contender);

		expect(readdirSync(spoolDir).filter((entry) => entry.includes(".reap-"))).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([recovered]);
	});

	it("recovers a dead reaper whose PID belongs to another process birth", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const recovered = realpathSync(makeTempDir());
		const ownerReady = join(harness.dir, "dead-owner-ready");
		const started = join(harness.dir, "contender-started");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, ownerReady]);
		await waitForFile(ownerReady, abandoned);
		await expectWorkerSuccess(abandoned);
		const lockFile = join(spoolDir, "machine-state.lock");
		const token = "00000000-0000-4000-8000-000000000014";
		linkSync(lockFile, `${lockFile}.reap-${token}`);
		writeFileSync(
			`${lockFile}.reaper-${token}.json`,
			JSON.stringify({
				pid: process.pid,
				birth: "a previous process instance",
				token,
				marker: { token: "00000000-0000-4000-8000-000000000015", fd: 999_997, dev: "0", ino: "0" },
			}),
		);

		const contender = harness.start(["register", spoolDir, recovered, started, done]);
		await expectWorkerSuccess(contender);

		expect(readdirSync(spoolDir).filter((entry) => entry.startsWith("machine-state.lock.reap"))).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([recovered]);
	});

	it("cleans a reaper claim that captured a replacement lock", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const stalledRoot = realpathSync(makeTempDir());
		const replacementRoot = realpathSync(makeTempDir());
		const deadOwnerReady = join(harness.dir, "dead-owner-ready");
		const reaperReady = join(harness.dir, "reaper-ready");
		const releaseReaper = join(harness.dir, "release-reaper");
		const reaperClaimed = join(harness.dir, "reaper-claimed");
		const replacementReady = join(harness.dir, "replacement-ready");
		const releaseReplacement = join(harness.dir, "release-replacement");

		const abandoned = harness.start(["die-holding", spoolDir, deadOwnerReady]);
		await waitForFile(deadOwnerReady, abandoned);
		await expectWorkerSuccess(abandoned);

		const stalled = harness.start([
			"stall-before-reaper-claim",
			spoolDir,
			stalledRoot,
			reaperReady,
			releaseReaper,
			reaperClaimed,
		]);
		await waitForFile(reaperReady, stalled);

		const replacement = harness.start([
			"hold-register",
			spoolDir,
			replacementRoot,
			replacementReady,
			releaseReplacement,
		]);
		await waitForFile(replacementReady, replacement);

		writeFileSync(releaseReaper, "go");
		await waitForFile(reaperClaimed, stalled);
		writeFileSync(releaseReplacement, "go");
		await expectWorkerSuccess(replacement);
		await expectWorkerSuccess(stalled);

		expect(readdirSync(spoolDir).filter((entry) => entry.includes(".reap-"))).toEqual([]);
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([replacementRoot, stalledRoot]);
	});

	it("never expires a live reaper after its final inode proof", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const protectedRoot = realpathSync(makeTempDir());
		const contenderRoot = realpathSync(makeTempDir());
		const deadOwnerReady = join(harness.dir, "dead-owner-ready");
		const proofed = join(harness.dir, "reaper-proofed");
		const releaseProof = join(harness.dir, "release-proof");
		const waiting = join(harness.dir, "contender-waiting");
		const done = join(harness.dir, "contender-done");

		const abandoned = harness.start(["die-holding", spoolDir, deadOwnerReady]);
		await waitForFile(deadOwnerReady, abandoned);
		await expectWorkerSuccess(abandoned);

		const protectedReaper = harness.start([
			"hold-after-reaper-proof",
			spoolDir,
			protectedRoot,
			proofed,
			releaseProof,
		]);
		await waitForFile(proofed, protectedReaper);

		const contender = harness.start(["register-when-available", spoolDir, contenderRoot, waiting, done]);
		await waitForFile(waiting, contender);

		writeFileSync(releaseProof, "go");
		await expectWorkerSuccess(protectedReaper);
		await expectWorkerSuccess(contender);
		expect(
			readRegistry(spoolDir)
				.projects.map((project) => project.root)
				.sort(),
		).toEqual([protectedRoot, contenderRoot].sort());
	});

	it("keeps remove atomic with a competing session replacement", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const removed = realpathSync(makeTempDir());
		const kept = realpathSync(makeTempDir());
		registerProject(spoolDir, removed);
		registerProject(spoolDir, kept);
		writeSession(spoolDir, { open: [removed, kept] });
		const ready = join(harness.dir, "holder-ready");
		const release = join(harness.dir, "release-holder");
		const waiting = join(harness.dir, "contender-waiting");
		const done = join(harness.dir, "contender-done");

		const holder = harness.start(["hold-remove", spoolDir, removed, ready, release]);
		await waitForFile(ready, holder);
		const contender = harness.start(["open-session-when-available", spoolDir, removed, waiting, done]);
		await waitForFile(waiting, contender);

		writeFileSync(release, "go");
		await expectWorkerSuccess(holder);
		await expectWorkerSuccess(contender);

		expect(JSON.parse(readFileSync(done, "utf8"))).toEqual({ kind: "unregistered", root: removed });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([kept]);
		expect(readSession(spoolDir)).toEqual({ open: [kept] });
	});

	it("keeps a project registered when removal dies after pruning its tab", { timeout: 15_000 }, async () => {
		const harness = makeHarness();
		const spoolDir = join(makeTempDir(), ".spool");
		const interrupted = realpathSync(makeTempDir());
		const kept = realpathSync(makeTempDir());
		registerProject(spoolDir, interrupted);
		registerProject(spoolDir, kept);
		writeSession(spoolDir, { open: [interrupted, kept] });
		const pruned = join(harness.dir, "session-pruned");

		const removal = harness.start(["die-after-session-prune", spoolDir, interrupted, pruned]);
		await waitForFile(pruned, removal);
		await expectWorkerSuccess(removal);

		expect(readSession(spoolDir)).toEqual({ open: [kept] });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([interrupted, kept]);
	});

	it("removes the root resolved before its path is replaced with another project", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const first = realpathSync(makeTempDir());
		const second = realpathSync(makeTempDir());
		const movedFirst = `${first}-moved`;
		registerProject(spoolDir, first);
		registerProject(spoolDir, second);
		writeSession(spoolDir, { open: [first, second] });

		const result = runMachineStateTestOperation(spoolDir, {
			kind: "replace-root-after-session-prune",
			root: first,
			movedRoot: movedFirst,
			replacementRoot: second,
		});

		expect(result).toEqual({ root: first, removed: true });
		expect(readSession(spoolDir)).toEqual({ open: [second] });
		expect(readRegistry(spoolDir).projects.map((project) => project.root)).toEqual([second]);
	});
});

function makeHarness(): {
	dir: string;
	start: (args: string[], env?: Record<string, string>) => Worker;
} {
	const dir = makeTempDir();
	const script = join(dir, "worker.ts");
	writeFileSync(script, workerSource());
	return {
		dir,
		start: (args, env) => {
			const child = spawn(tsxBin, [script, ...args], {
				cwd: repoRoot,
				env: env === undefined ? process.env : { ...process.env, ...env },
			});
			let stdout = "";
			let stderr = "";
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			const done = new Promise<number | null>((resolve, reject) => {
				child.once("error", reject);
				child.once("close", resolve);
			});
			onTestFinished(() => {
				if (child.exitCode === null) child.kill();
			});
			return { child, output: () => `${stdout}${stderr}`, done };
		},
	};
}

function alternateLocale(): string {
	const locales = execFileSync("/usr/bin/locale", ["-a"], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
	return locales.find((locale) => locale !== "C" && locale !== "POSIX") ?? "C";
}

async function waitForFile(file: string, worker: Worker): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (!existsSync(file)) {
		if (worker.child.exitCode !== null) {
			throw new Error(`worker exited before ${file}\n${worker.output()}`);
		}
		if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}\n${worker.output()}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

async function waitForEither(first: string, second: string, worker: Worker): Promise<string> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		if (existsSync(first)) return first;
		if (existsSync(second)) return second;
		if (worker.child.exitCode !== null) {
			throw new Error(`worker exited before ${first} or ${second}\n${worker.output()}`);
		}
		if (Date.now() >= deadline) throw new Error(`timed out waiting for ${first} or ${second}\n${worker.output()}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

async function expectWorkerSuccess(worker: Worker): Promise<void> {
	const status = await worker.done;
	expect(worker.output()).toBe("");
	expect(status).toBe(0);
}

function lockArtifacts(spoolDir: string): string[] {
	return readdirSync(spoolDir).filter((entry) => entry.startsWith("machine-state.lock."));
}

function workerSource(): string {
	const machineStateHarness = pathToFileURL(join(repoRoot, "src", "machine-state-test-harness.ts")).href;
	const registry = pathToFileURL(join(repoRoot, "src", "registry.ts")).href;
	const session = pathToFileURL(join(repoRoot, "src", "daemon", "session.ts")).href;
	return `import { writeFileSync } from "node:fs";
import { runMachineStateTestOperation } from ${JSON.stringify(machineStateHarness)};
import { registerProject } from ${JSON.stringify(registry)};
import { updateSession } from ${JSON.stringify(session)};

const [action, ...args] = process.argv.slice(2);
const arg = (index: number): string => {
	const value = args[index];
	if (value === undefined) throw new Error("missing worker argument " + index);
	return value;
};

switch (action) {
	case "hold-register":
		runMachineStateTestOperation(arg(0), {
			kind: "hold-register",
			root: arg(1),
			ready: arg(2),
			release: arg(3),
		});
		break;
	case "register":
		writeFileSync(arg(2), "started");
		registerProject(arg(0), arg(1));
		writeFileSync(arg(3), "done");
		break;
	case "register-when-available":
		runMachineStateTestOperation(arg(0), {
			kind: "register-when-available",
			root: arg(1),
			waiting: arg(2),
		});
		writeFileSync(arg(3), "done");
		break;
	case "stall-before-claim":
		runMachineStateTestOperation(arg(0), {
			kind: "stall-before-claim",
			root: arg(1),
			ready: arg(2),
			release: arg(3),
		});
		break;
	case "die-holding":
		runMachineStateTestOperation(arg(0), {
			kind: "die-holding",
			ready: arg(1),
		});
		break;
	case "die-reaping":
		runMachineStateTestOperation(arg(0), {
			kind: "die-reaping",
			root: arg(1),
			ready: arg(2),
		});
		break;
	case "die-before-reaper-claim":
		runMachineStateTestOperation(arg(0), {
			kind: "die-before-reaper-claim",
			root: arg(1),
			ready: arg(2),
		});
		break;
	case "die-after-reaper-claim-cleanup":
		runMachineStateTestOperation(arg(0), {
			kind: "die-after-reaper-claim-cleanup",
			root: arg(1),
			ready: arg(2),
		});
		break;
	case "stall-before-reaper-claim":
		runMachineStateTestOperation(arg(0), {
			kind: "stall-before-reaper-claim",
			root: arg(1),
			ready: arg(2),
			release: arg(3),
			claimed: arg(4),
		});
		break;
	case "hold-after-reaper-proof":
		runMachineStateTestOperation(arg(0), {
			kind: "hold-after-reaper-proof",
			root: arg(1),
			proofed: arg(2),
			release: arg(3),
		});
		break;
	case "hold-remove":
		runMachineStateTestOperation(arg(0), {
			kind: "hold-remove",
			root: arg(1),
			ready: arg(2),
			release: arg(3),
		});
		break;
	case "die-after-session-prune":
		runMachineStateTestOperation(arg(0), {
			kind: "die-after-session-prune",
			root: arg(1),
			ready: arg(2),
		});
		break;
	case "open-session": {
		writeFileSync(arg(2), "started");
		const result = updateSession(arg(0), arg(1), true);
		writeFileSync(arg(3), JSON.stringify(result));
		break;
	}
	case "open-session-when-available": {
		const result = runMachineStateTestOperation(arg(0), {
			kind: "open-session-when-available",
			root: arg(1),
			waiting: arg(2),
		});
		writeFileSync(arg(3), JSON.stringify(result));
		break;
	}
	default:
		throw new Error("unknown worker action: " + action);
}
`;
}
