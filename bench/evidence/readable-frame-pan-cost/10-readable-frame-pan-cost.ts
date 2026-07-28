#!/usr/bin/env node

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, type Hash } from "node:crypto";
import {
	appendFileSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";

interface WheelStep {
	step: number;
	offsetMs: number;
	deltaX: number;
	deltaY: number;
}

interface WheelSample {
	timestamp: number;
	seenAt: number;
	deltaX: number;
	deltaY: number;
	trusted: boolean;
}

interface RafSample {
	from: number;
	to: number;
	mounted: number;
}

interface LoafSample {
	startTime: number;
	duration: number;
	blocking: number;
}

interface CollectorState {
	lastRaf: number;
	loaded: Set<string>;
	loafs: LoafSample[];
	rafs: RafSample[];
	wheels: WheelSample[];
}

interface Collector {
	state: CollectorState;
	reset(): void;
}

declare global {
	var __debug132Collector: Collector | undefined;
	var __debug132ExpectedWheelEvents: number | undefined;
	var __debug132LiveCap: number | undefined;
	var __debug132LiveMinCssPx: number | undefined;
	var __debug132RareIntervalMs: number | undefined;
	var __debug132Trace: boolean | undefined;
}

interface Camera {
	x: number;
	y: number;
	k: number;
}

interface FrameRect {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fullAreaCssPx2: number;
	viewportIntersectionAreaCssPx2: number;
}

interface PageState {
	mounted: number;
	mountedNames: string[];
	labels: number;
	loaded: number;
	threshold: number | undefined;
	cap: number | null;
	camera: Camera | null;
	canvasViewport: { x: number; y: number; width: number; height: number } | null;
	fullDrawnAreaCssPx2: number;
	viewportIntersectionAreaCssPx2: number;
	frameRects: FrameRect[];
}

interface RawWindow {
	wheelCount: number;
	allTrusted: boolean;
	deltasMatch: boolean;
	eventSpanMs: number | null;
	eventGaps: number[];
	domWheelOffsetsMs: number[];
	clockSkewMaxMs: number | null;
	intervals: Array<{
		fromOffsetMs: number;
		toOffsetMs: number;
		duration: number;
		mounted: number;
	}>;
	loafs: LoafSample[];
}

interface Issuance {
	step: number;
	target: number;
	issuedAt: number;
}

interface PageWindow {
	before: PageState;
	after: PageState;
	raw: RawWindow;
	issuance: Issuance[];
}

interface AcceptancePayload {
	before: PageState;
	after: PageState;
	wheelCount: number;
	allTrusted: boolean;
	deltasMatch: boolean;
	eventSpanMs: number | null;
	eventGapP95Ms: number | null;
	eventGapMaxMs: number | null;
	clockSkewMaxMs: number | null;
	issueSpanMs: number | null;
	issueGapP95Ms: number | null;
	rafCount: number;
	rafP50Ms: number | null;
	rafP95Ms: number | null;
	rafWorstMs: number | null;
	loafCount: number;
	loafWorstBlockingMs: number;
	mountedMin: number | null;
	mountedMax: number | null;
}

interface ArmDefinition {
	threshold: number;
	cap: number | null;
	expectedMounted: number;
	zoom: number;
}

type ArmName = "picture" | "count4" | "count8" | "ringAtEqualAreaZoom" | "readable";
type ComparisonName = "main" | "count4" | "count8" | "eligibility";
type RunPhase = "warmup" | "main";
type RunOrder = "warmup" | "AB" | "BA";

interface ComparisonDefinition {
	arms: readonly [ArmName, ArmName];
	pairs: number;
	mode: "measurement" | "diagnostic";
}

interface RunIdentity {
	arm: ArmName;
	phase: RunPhase;
	pair: number;
	order: RunOrder;
	position: number;
	attempt: number;
}

interface Daemon {
	root: string;
	url: string;
	pid: number;
	stop(): Promise<void>;
}

interface MeasureOptions {
	browser: Browser;
	daemon: Daemon;
	browserVersion: string;
	cliSha256: string;
	distTreeSha256: string;
	identity: RunIdentity;
}

interface BuildControl {
	name: "scaling" | "threshold";
	distFileCount: number;
	distTreeSha256: string;
	patchFile: string;
	patchSha256: string;
	sourceSha256: string;
}

const FIXED_POINT = "2665510d6561f4f8b79ce71a2b1e621ce2f89024";
const SUBJECT_COMMIT = "b73493f98fedc5ba3df6b98273126912601a39d0";
const GENERATOR_SHA256 = "1c22f11f38a539c9d9db6852ea566d16906951bd0a18c9f9ea10d2c325ff77d8";
const SUBJECT_DESIGN_TREE_SHA256 = "2047b256d67bc6e4de35bad28d0c56cc43fc5faca277ba81f977e6014bc21d5f";
const SUBJECT_DESIGN_FILE_COUNT = 1904;
const BUILD_CONTROLS: Record<BuildControl["name"], BuildControl> = {
	threshold: {
		name: "threshold",
		distFileCount: 17,
		distTreeSha256: "fe0601d66d944a5bb4b9f136331522310d12805a595dcdabcc2c424cdc6aec40",
		patchFile: "10-readable-frame-pan-cost.patch",
		patchSha256: "cb321c48b8b699b82c408000a540fb535d9c0bd8d06fdd32c5e1097a13efebf8",
		sourceSha256: "8320a3ff22ac8e0d80173b75e35099cc15d1368959517f21585e0ae1733947dd",
	},
	scaling: {
		name: "scaling",
		distFileCount: 17,
		distTreeSha256: "47f779f93aeb4f8abbc44e6679a32f007a740222f9f2d488a3c636394f7a69fc",
		patchFile: "10-readable-frame-pan-cost-scaling.patch",
		patchSha256: "2010fa2b534103bc4bf1d51801405282d1e912545b69f1e2e3b7641d774b1eac",
		sourceSha256: "f0e08621fae10c8f9e85b378e6bb2b9d4a84d1adcfdc80f4aa1404bc8c3cffba",
	},
};
const BROWSER_CHANNEL = "chrome";
const EXPECTED_BROWSER_VERSION = "150.0.7871.187";
const PAGE = "n100";
const FRAME_COUNT = 100;
const VIEWPORT = { width: 1512, height: 945 };
const CANVAS_VIEWPORT = { width: 1220, height: 901 };
const DEVICE_SCALE_FACTOR = 2;
const SMALL_ZOOM = 0.45;
const EQUAL_AREA_ZOOM = SMALL_ZOOM * Math.SQRT2;
const WHEEL_EVENTS = 90;
const WHEEL_DELTA = 26;
const WHEEL_CADENCE_MS = 1000 / 60;
const WHEEL_SCHEDULE: readonly WheelStep[] = Array.from({ length: WHEEL_EVENTS }, (_, step) => {
	const sign = step < WHEEL_EVENTS / 2 ? 1 : -1;
	return {
		step,
		offsetMs: step * WHEEL_CADENCE_MS,
		deltaX: sign * WHEEL_DELTA,
		deltaY: sign * WHEEL_DELTA,
	};
});
const firstWheelStep = WHEEL_SCHEDULE[0];
const lastWheelStep = WHEEL_SCHEDULE.at(-1);
if (firstWheelStep === undefined || lastWheelStep === undefined) throw new Error("wheel schedule is empty");
const EXPECTED_EVENT_SPAN_MS = lastWheelStep.offsetMs - firstWheelStep.offsetMs;
const WHEEL_SCHEDULE_SHA256 = createHash("sha256").update(JSON.stringify(WHEEL_SCHEDULE)).digest("hex");
const EVENT_SPAN_TOLERANCE_MS = 8;
const EVENT_GAP_P95_LIMIT_MS = 18.5;
const EVENT_GAP_MAX_LIMIT_MS = 25;
const ANALYSIS_WINDOW_MS = 1700;
const READY_QUIET_MS = 1000;
const PILOT = process.env.DEBUG132_PILOT === "1";
const MAX_PAIR_ATTEMPTS = 5;
const BOOTSTRAP_DRAWS = 50_000;
const EQUIVALENCE_MARGIN_MS = 2.5;
const RARE_INTERVAL_MS = 12;
const ARM_DEFINITIONS: Record<ArmName, ArmDefinition> = {
	picture: { threshold: 541, cap: null, expectedMounted: 0, zoom: SMALL_ZOOM },
	count4: { threshold: 400, cap: 4, expectedMounted: 4, zoom: SMALL_ZOOM },
	count8: { threshold: 400, cap: 8, expectedMounted: 8, zoom: SMALL_ZOOM },
	ringAtEqualAreaZoom: { threshold: 400, cap: 8, expectedMounted: 4, zoom: EQUAL_AREA_ZOOM },
	readable: { threshold: 400, cap: null, expectedMounted: 16, zoom: SMALL_ZOOM },
};
const COMPARISONS: Record<ComparisonName, ComparisonDefinition> = {
	main: { arms: ["picture", "readable"], pairs: 20, mode: "measurement" },
	count4: { arms: ["picture", "count4"], pairs: 10, mode: "measurement" },
	count8: { arms: ["picture", "count8"], pairs: 10, mode: "measurement" },
	eligibility: { arms: ["count8", "ringAtEqualAreaZoom"], pairs: 1, mode: "diagnostic" },
};

const requestedComparison = process.env.DEBUG132_COMPARISON ?? "main";
if (!isComparisonName(requestedComparison)) {
	throw new Error(`unknown DEBUG132_COMPARISON ${requestedComparison}`);
}
const comparisonName = requestedComparison;
const comparison = COMPARISONS[comparisonName];
const PAIRS = Number(process.env.DEBUG132_PAIRS ?? comparison.pairs);
const driverPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(driverPath);
const outputSuffix = comparisonName === "main" ? "" : `-${comparisonName}`;
const output = resolve(
	process.env.DEBUG132_OUTPUT ?? join(scriptDir, `10-readable-frame-pan-cost${outputSuffix}.ndjson`),
);
const traceDir = process.env.DEBUG132_TRACE_DIR === undefined ? undefined : resolve(process.env.DEBUG132_TRACE_DIR);
const spoolBuild = requiredPath("SPOOL_BUILD");
const spoolBench = requiredPath("SPOOL_BENCH");

if (!Number.isInteger(PAIRS) || PAIRS < (PILOT ? 1 : comparison.pairs)) {
	throw new Error(`DEBUG132_PAIRS must be an integer of at least ${PILOT ? 1 : comparison.pairs}`);
}

function isComparisonName(value: string): value is ComparisonName {
	return Object.hasOwn(COMPARISONS, value);
}

function requiredPath(name: string): string {
	const value = process.env[name];
	if (value === undefined || value.length === 0) throw new Error(`${name} must name an absolute path`);
	return resolve(value);
}

function git(path: string, ...args: string[]): string {
	return execFileSync("git", ["-C", path, ...args], { encoding: "utf8" }).trim();
}

function gitStatus(path: string): string {
	return execFileSync("git", ["-C", path, "status", "--porcelain=v1", "--untracked-files=all"], {
		encoding: "utf8",
	}).replace(/\r?\n$/, "");
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function updateFingerprint(hash: Hash, ...fields: readonly (Buffer | string)[]): void {
	for (const field of fields) {
		const bytes = typeof field === "string" ? Buffer.from(field) : field;
		const length = Buffer.alloc(8);
		length.writeBigUInt64BE(BigInt(bytes.length));
		hash.update(length);
		hash.update(bytes);
	}
}

function fingerprintTree(root: string): { sha256: string; fileCount: number } {
	const hash = createHash("sha256");
	let fileCount = 0;
	const visit = (relativeDirectory: string): void => {
		const directory = relativeDirectory.length === 0 ? root : join(root, relativeDirectory);
		const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
			left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
		);
		for (const entry of entries) {
			const relativePath =
				relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
			const absolutePath = join(root, relativePath);
			const stat = lstatSync(absolutePath);
			if (entry.isDirectory()) {
				updateFingerprint(hash, "directory", relativePath);
				visit(relativePath);
			} else if (entry.isFile()) {
				updateFingerprint(hash, "file", relativePath, readFileSync(absolutePath));
				fileCount++;
			} else if (entry.isSymbolicLink()) {
				updateFingerprint(hash, "symlink", relativePath, readlinkSync(absolutePath));
			} else {
				throw new Error(`subject design contains unsupported entry ${relativePath} with mode ${stat.mode}`);
			}
		}
	};
	visit("");
	return { sha256: hash.digest("hex"), fileCount };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function percentile(values: readonly number[], q: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1))] ?? null;
}

function requiredMetric(value: number | null, label: string): number {
	if (value === null || !Number.isFinite(value)) throw new Error(`${label} is unavailable`);
	return value;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) throw new Error("cannot calculate a mean without values");
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits = 3): number | null {
	if (value === null) return null;
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function pairedBootstrapMeanInterval(values: readonly number[]): { low: number; high: number } {
	const random = mulberry32(132);
	const draws: number[] = [];
	for (let draw = 0; draw < BOOTSTRAP_DRAWS; draw++) {
		let sum = 0;
		for (let index = 0; index < values.length; index++) {
			const sampled = values[Math.floor(random() * values.length)];
			if (sampled === undefined) throw new Error("bootstrap sample was unavailable");
			sum += sampled;
		}
		draws.push(sum / values.length);
	}
	return {
		low: requiredMetric(percentile(draws, 0.025), "bootstrap low bound"),
		high: requiredMetric(percentile(draws, 0.975), "bootstrap high bound"),
	};
}

function inspectSubject() {
	const buildCommit = git(spoolBuild, "rev-parse", "HEAD");
	if (buildCommit !== FIXED_POINT) throw new Error(`SPOOL_BUILD is ${buildCommit}, expected ${FIXED_POINT}`);
	const control = comparisonName === "main" ? BUILD_CONTROLS.threshold : BUILD_CONTROLS.scaling;
	const buildStatus = gitStatus(spoolBuild);
	const expectedBuildStatus = " M src/ui/canvas/lifecycle.ts";
	if (buildStatus !== expectedBuildStatus) {
		throw new Error(`SPOOL_BUILD status is ${JSON.stringify(buildStatus)}, expected the exact control patch`);
	}
	const controlPatchPath = join(scriptDir, control.patchFile);
	const controlPatchSha256 = sha256(controlPatchPath);
	if (controlPatchSha256 !== control.patchSha256) {
		throw new Error(`${control.patchFile} is ${controlPatchSha256}, expected ${control.patchSha256}`);
	}
	const lifecycleSource = join(spoolBuild, "src", "ui", "canvas", "lifecycle.ts");
	const controlSourceSha256 = sha256(lifecycleSource);
	if (controlSourceSha256 !== control.sourceSha256) {
		throw new Error(`control source is ${controlSourceSha256}, expected ${control.sourceSha256}`);
	}
	const cliPath = join(spoolBuild, "dist", "cli.js");
	if (!existsSync(cliPath)) throw new Error("SPOOL_BUILD has not been built");
	const cliSha256 = sha256(cliPath);
	const distTree = fingerprintTree(join(spoolBuild, "dist"));
	if (distTree.sha256 !== control.distTreeSha256 || distTree.fileCount !== control.distFileCount) {
		throw new Error(
			`${control.name} dist tree is ${distTree.sha256} with ${distTree.fileCount} files, expected ${control.distTreeSha256} with ${control.distFileCount}`,
		);
	}

	const subjectCommit = git(spoolBench, "rev-parse", "HEAD");
	if (subjectCommit !== SUBJECT_COMMIT) {
		throw new Error(`SPOOL_BENCH is ${subjectCommit}, expected ${SUBJECT_COMMIT}`);
	}
	const subjectStatus = gitStatus(spoolBench);
	if (subjectStatus !== "") {
		throw new Error(`SPOOL_BENCH has unexpected tracked or untracked source changes: ${subjectStatus}`);
	}
	const generatorHash = sha256(join(spoolBench, "generate.mjs"));
	if (generatorHash !== GENERATOR_SHA256) {
		throw new Error(`generate.mjs is ${generatorHash}, expected ${GENERATOR_SHA256}`);
	}
	const designTree = fingerprintTree(join(spoolBench, "design"));
	if (
		designTree.sha256 !== SUBJECT_DESIGN_TREE_SHA256 ||
		designTree.fileCount !== SUBJECT_DESIGN_FILE_COUNT
	) {
		throw new Error(
			`subject design tree is ${designTree.sha256} with ${designTree.fileCount} files, expected ${SUBJECT_DESIGN_TREE_SHA256} with ${SUBJECT_DESIGN_FILE_COUNT}`,
		);
	}

	const thumbs = join(spoolBench, "design", ".spool", "thumbs");
	const frames = readdirSync(thumbs, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^n100-\d{3}$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	if (frames.length !== FRAME_COUNT) throw new Error(`n100 has ${frames.length} cover directories, expected ${FRAME_COUNT}`);
	for (const frame of frames) {
		const rungs = readdirSync(join(thumbs, frame))
			.filter((name) => name.endsWith(".jpg"))
			.map((name) => name.split(".").at(-2))
			.sort();
		if (JSON.stringify(rungs) !== JSON.stringify(["1200", "2400", "600"])) {
			throw new Error(`${frame} cover rungs are ${rungs.join(", ")}, expected 600, 1200, 2400`);
		}
	}
	return {
		buildCommit,
		buildControl: control.name,
		controlPatch: control.patchFile,
		controlPatchSha256,
		controlSourceSha256,
		cliSha256,
		distTreeSha256: distTree.sha256,
		distFileCount: distTree.fileCount,
		distTreeFingerprint: "sha256 of length-prefixed entry type, relative path, and file bytes or symlink target",
		buildSourceStatus: "exact control patch only",
		subjectCommit,
		generatorSha256: generatorHash,
		subjectDesignTreeSha256: designTree.sha256,
		subjectDesignFileCount: designTree.fileCount,
		subjectDesignTreeFingerprint: "sha256 of length-prefixed entry type, relative path, and file bytes or symlink target",
		subjectSourceStatus: "clean tracked and untracked source",
		completeCoverFrames: frames.length,
		coverRungs: [600, 1200, 2400],
	};
}

function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (address === null || typeof address === "string") {
				reject(new Error("could not allocate a daemon port"));
				return;
			}
			probe.close(() => resolvePort(address.port));
		});
	});
}

function runProcess(command: string, args: readonly string[], env: Readonly<Record<string, string>>): Promise<void> {
	return new Promise((resolveRun, reject) => {
		const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore" });
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) resolveRun();
			else reject(new Error(`${command} exited ${code}`));
		});
	});
}

function targetCamera(zoom: number): Camera {
	const columns = 10;
	const rows = 10;
	const center = {
		x: 600 + ((columns - 1) * 1380) / 2,
		y: 400 + ((rows - 1) * 980) / 2,
	};
	return {
		x: CANVAS_VIEWPORT.width / 2 - center.x * zoom,
		y: CANVAS_VIEWPORT.height / 2 - center.y * zoom,
		k: zoom,
	};
}

function writeCamera(root: string, zoom: number): void {
	const statePath = join(root, "design", ".spool", "state.json");
	const state = JSON.parse(readFileSync(statePath, "utf8")) as {
		arrows: boolean;
		activePage: string;
		pageCameras: Record<string, Camera>;
	};
	state.arrows = true;
	state.activePage = PAGE;
	state.pageCameras = { ...state.pageCameras, [PAGE]: targetCamera(zoom) };
	writeFileSync(statePath, `${JSON.stringify(state, null, "\t")}\n`);
}

function removeTemporaryFixture(root: string): void {
	const prefix = `${tmpdir()}/spool-132-`;
	if (!root.startsWith(prefix)) throw new Error(`refusing to remove unexpected temporary root ${root}`);
	rmSync(dirname(root), { force: true, recursive: true });
}

async function stopChildProcess(child: ChildProcess, childExit: Promise<void>): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill();
	const exited = await Promise.race([childExit.then(() => true), delay(2000).then(() => false)]);
	if (exited) return;
	child.kill("SIGKILL");
	const killed = await Promise.race([childExit.then(() => true), delay(2000).then(() => false)]);
	if (!killed) throw new Error(`daemon process ${child.pid ?? "unknown"} did not exit`);
}

async function startDaemon(): Promise<Daemon> {
	const root = join(mkdtempSync(join(tmpdir(), "spool-132-")), basename(spoolBench));
	let child: ChildProcess | undefined;
	let childExit: Promise<void> | undefined;
	try {
		mkdirSync(root, { recursive: true });
		cpSync(join(spoolBench, "design"), join(root, "design"), { recursive: true });
		writeCamera(root, SMALL_ZOOM);
		const spoolDir = join(root, "spool");
		mkdirSync(spoolDir, { recursive: true });
		writeFileSync(join(spoolDir, "config.json"), '{"updateCheck":false}\n');
		const port = await freePort();
		const env = { SPOOL_DIR: spoolDir, SPOOL_PORT: String(port) };
		const cli = join(spoolBuild, "dist", "cli.js");
		await runProcess(process.execPath, [cli, "open", root], env);
		child = spawn(process.execPath, [cli, "serve", "--foreground"], {
			env: { ...process.env, ...env },
			stdio: "ignore",
		});
		childExit = new Promise<void>((resolveExit) => child?.once("exit", () => resolveExit()));
		if (child.pid === undefined) throw new Error("daemon did not receive a process id");
		const pid = child.pid;
		const activeChild = child;
		const activeChildExit = childExit;
		let stopped = false;
		const url = `http://127.0.0.1:${port}/p/${encodeURIComponent(basename(root))}`;
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			try {
				if ((await fetch(url)).ok) {
					return {
						root,
						url,
						pid,
						async stop() {
							if (stopped) return;
							await stopChildProcess(activeChild, activeChildExit);
							removeTemporaryFixture(root);
							stopped = true;
						},
					};
				}
			} catch {}
			await delay(100);
		}
		throw new Error("daemon did not start");
	} catch (error) {
		try {
			if (child !== undefined && childExit !== undefined) await stopChildProcess(child, childExit);
		} finally {
			removeTemporaryFixture(root);
		}
		throw error;
	}
}

function installCollector(): void {
	if (window.top !== window) return;
	const state: CollectorState = {
		lastRaf: performance.now(),
		loaded: new Set<string>(),
		loafs: [],
		rafs: [],
		wheels: [],
	};
	const tick = (now: number) => {
		if (
			globalThis.__debug132Trace === true &&
			now - state.lastRaf > (globalThis.__debug132RareIntervalMs ?? Number.POSITIVE_INFINITY)
		) {
			performance.mark(`DEBUG132_RAF_GAP|${state.lastRaf.toFixed(3)}|${now.toFixed(3)}|${(now - state.lastRaf).toFixed(3)}`);
		}
		state.rafs.push({
			from: state.lastRaf,
			to: now,
			mounted: document.querySelectorAll("iframe[title]").length,
		});
		state.lastRaf = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.addEventListener(
		"wheel",
		(event) => {
			if (globalThis.__debug132Trace === true && state.wheels.length === 0) {
				performance.mark(`DEBUG132_FIRST_WHEEL|${event.timeStamp.toFixed(3)}`);
			}
			state.wheels.push({
				timestamp: event.timeStamp,
				seenAt: performance.now(),
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				trusted: event.isTrusted,
			});
			if (
				globalThis.__debug132Trace === true &&
				state.wheels.length === globalThis.__debug132ExpectedWheelEvents
			) {
				performance.mark("DEBUG132_LAST_WHEEL");
			}
		},
		{ capture: true, passive: true },
	);
	window.addEventListener("message", (event) => {
		const message = event.data as { spool?: unknown; frame?: unknown } | null;
		if (message?.spool === "loaded" && typeof message.frame === "string") state.loaded.add(message.frame);
	});
	if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
		new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				const loaf = entry as PerformanceEntry & { blockingDuration?: number };
				state.loafs.push({
					startTime: loaf.startTime,
					duration: loaf.duration,
					blocking: loaf.blockingDuration ?? 0,
				});
			}
		}).observe({ type: "long-animation-frame" });
	}
	globalThis.__debug132Collector = {
		state,
		reset() {
			state.lastRaf = performance.now();
			state.loafs.length = 0;
			state.rafs.length = 0;
			state.wheels.length = 0;
		},
	};
}

async function waitUntilReady(page: Page, expectedMounted: number): Promise<void> {
	try {
		await page.waitForFunction(
			({ expectedFrames, expectedDocuments }: { expectedFrames: number; expectedDocuments: number }) => {
				const collector = globalThis.__debug132Collector;
				if (collector === undefined) return false;
				const titles = [...document.querySelectorAll<HTMLIFrameElement>("iframe[title]")].map(
					(frame) => frame.title,
				);
				const documentsReady = titles.every((title) => collector.state.loaded.has(title));
				return (
					document.querySelectorAll("[data-frame-label]").length === expectedFrames &&
					titles.length === expectedDocuments &&
					documentsReady
				);
			},
			{ expectedFrames: FRAME_COUNT, expectedDocuments: expectedMounted },
			{ timeout: 60_000 },
		);
	} catch (error) {
		const state = await readPageState(page);
		throw new Error(`page did not become ready: ${JSON.stringify(state)}`, { cause: error });
	}
	await page.waitForTimeout(READY_QUIET_MS);
}

async function readPageState(page: Page): Promise<PageState> {
	return page.evaluate((): PageState => {
		const viewport = document.querySelector<HTMLElement>('[role="application"]');
		const layer = [...(viewport?.children ?? [])].find(
			(element): element is HTMLElement =>
				element instanceof HTMLElement && element.style.transformOrigin === "0px 0px",
		);
		let camera: Camera | null = null;
		if (layer !== undefined) {
			const matrix = new DOMMatrix(getComputedStyle(layer).transform);
			camera = { x: matrix.e, y: matrix.f, k: matrix.a };
		}

		const viewportRect = viewport?.getBoundingClientRect();
		const frameRects = [...document.querySelectorAll<HTMLIFrameElement>("iframe[title]")]
			.map((frame): FrameRect => {
				const rect = frame.getBoundingClientRect();
				const intersectionWidth =
					viewportRect === undefined
						? 0
						: Math.max(0, Math.min(rect.right, viewportRect.right) - Math.max(rect.left, viewportRect.left));
				const intersectionHeight =
					viewportRect === undefined
						? 0
						: Math.max(0, Math.min(rect.bottom, viewportRect.bottom) - Math.max(rect.top, viewportRect.top));
				return {
					name: frame.title,
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
					fullAreaCssPx2: rect.width * rect.height,
					viewportIntersectionAreaCssPx2: intersectionWidth * intersectionHeight,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));

		return {
			mounted: frameRects.length,
			mountedNames: frameRects.map((frame) => frame.name),
			labels: document.querySelectorAll("[data-frame-label]").length,
			loaded: globalThis.__debug132Collector?.state.loaded.size ?? 0,
			threshold: globalThis.__debug132LiveMinCssPx,
			cap: globalThis.__debug132LiveCap ?? null,
			camera,
			canvasViewport:
				viewportRect === undefined
					? null
					: {
							x: viewportRect.x,
							y: viewportRect.y,
							width: viewportRect.width,
							height: viewportRect.height,
						},
			fullDrawnAreaCssPx2: frameRects.reduce((total, frame) => total + frame.fullAreaCssPx2, 0),
			viewportIntersectionAreaCssPx2: frameRects.reduce(
				(total, frame) => total + frame.viewportIntersectionAreaCssPx2,
				0,
			),
			frameRects,
		};
	});
}

async function saveTrace(cdp: CDPSession, path: string): Promise<void> {
	interface TraceComplete {
		stream?: string;
	}
	interface TraceChunk {
		data: string;
		base64Encoded?: boolean;
		eof?: boolean;
	}

	const completed = new Promise<TraceComplete>((resolveTrace) => {
		cdp.once("Tracing.tracingComplete", (event: unknown) => resolveTrace(event as TraceComplete));
	});
	await cdp.send("Tracing.end");
	const result = await completed;
	if (result.stream === undefined) throw new Error("trace did not return a stream");
	const chunks: Buffer[] = [];
	for (;;) {
		const chunk = (await cdp.send("IO.read", { handle: result.stream })) as TraceChunk;
		chunks.push(Buffer.from(chunk.data, chunk.base64Encoded === true ? "base64" : "utf8"));
		if (chunk.eof === true) break;
	}
	await cdp.send("IO.close", { handle: result.stream });
	writeFileSync(path, gzipSync(Buffer.concat(chunks)));
}

async function dispatchFixedCadence(cdp: CDPSession, schedule: readonly WheelStep[]): Promise<Issuance[]> {
	const x = Math.round(VIEWPORT.width / 2);
	const y = Math.round(VIEWPORT.height / 2);
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
	const firstTarget = performance.now() + 100;
	const pending: Array<Issuance & { done: Promise<unknown> }> = [];
	for (const entry of schedule) {
		const target = firstTarget + entry.offsetMs;
		for (;;) {
			const remaining = target - performance.now();
			if (remaining <= 0) break;
			if (remaining > 5) await delay(remaining - 4);
		}
		const issuedAt = performance.now();
		pending.push({
			step: entry.step,
			target,
			issuedAt,
			done: cdp.send("Input.dispatchMouseEvent", {
				type: "mouseWheel",
				x,
				y,
				deltaX: entry.deltaX,
				deltaY: entry.deltaY,
			}),
		});
	}
	await Promise.all(pending.map((dispatch) => dispatch.done));
	return pending.map(({ step, target, issuedAt }) => ({ step, target, issuedAt }));
}

async function collectPageWindow(
	page: Page,
	cdp: CDPSession,
	schedule: readonly WheelStep[],
	definition: ArmDefinition,
): Promise<PageWindow> {
	const before = await readPageState(page);
	if (before.threshold !== definition.threshold) {
		throw new Error(`threshold was ${before.threshold}, expected ${definition.threshold}`);
	}
	if (before.cap !== definition.cap) throw new Error(`cap was ${before.cap}, expected ${definition.cap}`);

	await page.evaluate(() => globalThis.__debug132Collector?.reset());
	const issuance = await dispatchFixedCadence(cdp, schedule);
	await page.waitForFunction(
		({ windowMs }: { windowMs: number }) => {
			const wheels = globalThis.__debug132Collector?.state.wheels ?? [];
			const first = wheels[0];
			return first !== undefined && performance.now() >= first.timestamp + windowMs;
		},
		{ windowMs: ANALYSIS_WINDOW_MS },
		{ timeout: 10_000 },
	);
	await page.evaluate(() => {
		if (globalThis.__debug132Trace === true) performance.mark("DEBUG132_ANALYSIS_END");
	});
	const after = await readPageState(page);
	const raw = await page.evaluate(
		({
			analysisWindowMs,
			wheelSchedule,
		}: {
			analysisWindowMs: number;
			wheelSchedule: WheelStep[];
		}): RawWindow => {
			const state = globalThis.__debug132Collector?.state;
			if (state === undefined) throw new Error("collector is unavailable");
			const wheels = state.wheels.slice(0, wheelSchedule.length);
			const firstWheel = wheels[0];
			const lastWheel = wheels.at(-1);
			const windowStart = firstWheel?.timestamp ?? 0;
			const windowEnd = windowStart + analysisWindowMs;
			const intervals = state.rafs
				.filter((sample) => sample.from >= windowStart && sample.to <= windowEnd)
				.map((sample) => ({
					fromOffsetMs: sample.from - windowStart,
					toOffsetMs: sample.to - windowStart,
					duration: sample.to - sample.from,
					mounted: sample.mounted,
				}));
			const eventGaps: number[] = [];
			for (let index = 1; index < wheels.length; index++) {
				const current = wheels[index];
				const previous = wheels[index - 1];
				if (current !== undefined && previous !== undefined) {
					eventGaps.push(current.timestamp - previous.timestamp);
				}
			}
			const deltasMatch =
				wheels.length === wheelSchedule.length &&
				wheels.every((event, index) => {
					const expected = wheelSchedule[index];
					return (
						expected !== undefined &&
						event.deltaX === expected.deltaX &&
						event.deltaY === expected.deltaY
					);
				});
			const loafs = state.loafs.filter(
				(entry) => entry.startTime < windowEnd && entry.startTime + entry.duration > windowStart,
			);
			return {
				wheelCount: wheels.length,
				allTrusted: wheels.every((event) => event.trusted),
				deltasMatch,
				eventSpanMs:
					firstWheel === undefined || lastWheel === undefined ? null : lastWheel.timestamp - firstWheel.timestamp,
				eventGaps,
				domWheelOffsetsMs: wheels.map((event) => event.timestamp - windowStart),
				clockSkewMaxMs:
					wheels.length === 0
						? null
						: Math.max(...wheels.map((event) => Math.abs(event.seenAt - event.timestamp))),
				intervals,
				loafs,
			};
		},
		{ analysisWindowMs: ANALYSIS_WINDOW_MS, wheelSchedule: [...schedule] },
	);
	return { before, after, raw, issuance };
}

function camerasMatch(left: Camera | null, right: Camera | null): boolean {
	if (left === null || right === null) return left === right;
	return (
		Math.abs(left.x - right.x) < 0.001 &&
		Math.abs(left.y - right.y) < 0.001 &&
		Math.abs(left.k - right.k) < 0.000_001
	);
}

function evaluateAcceptance(
	payload: AcceptancePayload,
	definition: ArmDefinition,
): string[] {
	const reasons: string[] = [];
	if (payload.wheelCount !== WHEEL_SCHEDULE.length) reasons.push(`wheel count ${payload.wheelCount}`);
	if (!payload.allTrusted) reasons.push("untrusted wheel input");
	if (!payload.deltasMatch) reasons.push("wheel deltas differ from the schedule");
	if (
		payload.eventSpanMs === null ||
		Math.abs(payload.eventSpanMs - EXPECTED_EVENT_SPAN_MS) > EVENT_SPAN_TOLERANCE_MS
	) {
		reasons.push(`event span ${round(payload.eventSpanMs)} ms`);
	}
	if (payload.eventGapP95Ms === null || payload.eventGapP95Ms > EVENT_GAP_P95_LIMIT_MS) {
		reasons.push(`event gap p95 ${round(payload.eventGapP95Ms)} ms`);
	}
	if (payload.eventGapMaxMs === null || payload.eventGapMaxMs > EVENT_GAP_MAX_LIMIT_MS) {
		reasons.push(`event gap max ${round(payload.eventGapMaxMs)} ms`);
	}
	if (payload.mountedMin !== definition.expectedMounted || payload.mountedMax !== definition.expectedMounted) {
		reasons.push(`mounted range ${payload.mountedMin}-${payload.mountedMax}`);
	}
	if (
		payload.before.mounted !== definition.expectedMounted ||
		payload.after.mounted !== definition.expectedMounted
	) {
		reasons.push(`endpoint mounted ${payload.before.mounted}-${payload.after.mounted}`);
	}
	if (payload.before.labels !== FRAME_COUNT || payload.after.labels !== FRAME_COUNT) {
		reasons.push(`frame labels ${payload.before.labels}-${payload.after.labels}`);
	}
	if (!camerasMatch(payload.before.camera, payload.after.camera)) reasons.push("camera did not return");
	if (
		payload.before.camera === null ||
		Math.abs(payload.before.camera.k - definition.zoom) > 0.000_001
	) {
		reasons.push(`camera zoom ${payload.before.camera?.k ?? "unavailable"}`);
	}
	if (
		payload.before.canvasViewport === null ||
		payload.after.canvasViewport === null ||
		Math.abs(payload.before.canvasViewport.width - CANVAS_VIEWPORT.width) > 1 ||
		Math.abs(payload.before.canvasViewport.height - CANVAS_VIEWPORT.height) > 1 ||
		JSON.stringify(payload.before.canvasViewport) !== JSON.stringify(payload.after.canvasViewport)
	) {
		reasons.push("canvas viewport geometry changed");
	}
	if (JSON.stringify(payload.before.mountedNames) !== JSON.stringify(payload.after.mountedNames)) {
		reasons.push("mounted frame set changed");
	}
	if (
		Math.abs(payload.before.fullDrawnAreaCssPx2 - payload.after.fullDrawnAreaCssPx2) > 1 ||
		Math.abs(
			payload.before.viewportIntersectionAreaCssPx2 - payload.after.viewportIntersectionAreaCssPx2,
		) > 1
	) {
		reasons.push("mounted frame area changed");
	}
	if (payload.rafCount < 150) reasons.push(`only ${payload.rafCount} rAF intervals`);
	return reasons;
}

function buildRunRecord(
	identity: RunIdentity,
	definition: ArmDefinition,
	browserVersion: string,
	cliSha256: string,
	distTreeSha256: string,
	window: PageWindow,
	pageErrors: readonly string[],
	traceName: string | null,
) {
	const durations = window.raw.intervals.map((sample) => sample.duration);
	const mounted = window.raw.intervals.map((sample) => sample.mounted);
	const issued = [...window.issuance].sort((left, right) => left.step - right.step);
	const issueGaps: number[] = [];
	for (let index = 1; index < issued.length; index++) {
		const current = issued[index];
		const previous = issued[index - 1];
		if (current !== undefined && previous !== undefined) issueGaps.push(current.issuedAt - previous.issuedAt);
	}
	const firstIssued = issued[0];
	const lastIssued = issued.at(-1);
	const payload: AcceptancePayload = {
		before: window.before,
		after: window.after,
		wheelCount: window.raw.wheelCount,
		allTrusted: window.raw.allTrusted,
		deltasMatch: window.raw.deltasMatch,
		eventSpanMs: window.raw.eventSpanMs,
		eventGapP95Ms: percentile(window.raw.eventGaps, 0.95),
		eventGapMaxMs: percentile(window.raw.eventGaps, 1),
		clockSkewMaxMs: window.raw.clockSkewMaxMs,
		issueSpanMs:
			firstIssued === undefined || lastIssued === undefined ? null : lastIssued.issuedAt - firstIssued.issuedAt,
		issueGapP95Ms: percentile(issueGaps, 0.95),
		rafCount: durations.length,
		rafP50Ms: percentile(durations, 0.5),
		rafP95Ms: percentile(durations, 0.95),
		rafWorstMs: percentile(durations, 1),
		loafCount: window.raw.loafs.length,
		loafWorstBlockingMs: Math.max(0, ...window.raw.loafs.map((entry) => entry.blocking)),
		mountedMin: percentile(mounted, 0),
		mountedMax: percentile(mounted, 1),
	};
	const rejectionReasons = evaluateAcceptance(payload, definition);
	const worstInterval = [...window.raw.intervals].sort(
		(left, right) => right.duration - left.duration || left.fromOffsetMs - right.fromOffsetMs,
	)[0];
	return {
		kind: "run" as const,
		...identity,
		threshold: definition.threshold,
		cap: definition.cap,
		expectedMounted: definition.expectedMounted,
		browserVersion,
		cliSha256,
		distTreeSha256,
		viewport: VIEWPORT,
		deviceScaleFactor: DEVICE_SCALE_FACTOR,
		zoom: definition.zoom,
		analysisWindowMs: ANALYSIS_WINDOW_MS,
		wheelEvents: WHEEL_SCHEDULE.length,
		wheelScheduleSha256: WHEEL_SCHEDULE_SHA256,
		actualWheelEvents: payload.wheelCount,
		allTrusted: payload.allTrusted,
		deltasMatch: payload.deltasMatch,
		wheelCadenceMs: round(WHEEL_CADENCE_MS),
		domWheelOffsetsMs: window.raw.domWheelOffsetsMs.map((value) => round(value)),
		eventSpanMs: round(payload.eventSpanMs),
		eventGapP95Ms: round(payload.eventGapP95Ms),
		eventGapMaxMs: round(payload.eventGapMaxMs),
		issueSpanMs: round(payload.issueSpanMs),
		issueGapP95Ms: round(payload.issueGapP95Ms),
		clockSkewMaxMs: round(payload.clockSkewMaxMs),
		rafCount: payload.rafCount,
		rafP50Ms: round(payload.rafP50Ms),
		rafP95Ms: round(payload.rafP95Ms),
		rafWorstMs: round(payload.rafWorstMs),
		rafWorstWindow:
			worstInterval === undefined
				? null
				: {
						fromOffsetMs: round(worstInterval.fromOffsetMs),
						toOffsetMs: round(worstInterval.toOffsetMs),
						durationMs: round(worstInterval.duration),
					},
		loafCount: payload.loafCount,
		loafWorstBlockingMs: round(payload.loafWorstBlockingMs),
		mountedBefore: window.before.mounted,
		mountedMin: payload.mountedMin,
		mountedMax: payload.mountedMax,
		mountedAfter: window.after.mounted,
		mountedNamesBefore: window.before.mountedNames,
		mountedNamesAfter: window.after.mountedNames,
		fullDrawnAreaCssPx2: round(
			(window.before.fullDrawnAreaCssPx2 + window.after.fullDrawnAreaCssPx2) / 2,
		),
		viewportIntersectionAreaCssPx2: round(
			(window.before.viewportIntersectionAreaCssPx2 + window.after.viewportIntersectionAreaCssPx2) / 2,
		),
		frameRectsBefore: window.before.frameRects.map((frame) => ({
			...frame,
			x: round(frame.x),
			y: round(frame.y),
			width: round(frame.width),
			height: round(frame.height),
			fullAreaCssPx2: round(frame.fullAreaCssPx2),
			viewportIntersectionAreaCssPx2: round(frame.viewportIntersectionAreaCssPx2),
		})),
		cameraBefore: window.before.camera,
		cameraAfter: window.after.camera,
		canvasViewport: window.before.canvasViewport,
		pageErrors,
		traceName,
		accepted: rejectionReasons.length === 0 && pageErrors.length === 0,
		rejectionReasons: [...rejectionReasons, ...pageErrors.map((error) => `page error: ${error}`)],
	};
}

type RunRecord = ReturnType<typeof buildRunRecord>;

async function measureRun(options: MeasureOptions): Promise<RunRecord> {
	const { browser, daemon, browserVersion, cliSha256, distTreeSha256, identity } = options;
	const definition = ARM_DEFINITIONS[identity.arm];
	writeCamera(daemon.root, definition.zoom);
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
	await context.addInitScript(
		(control: {
			threshold: number;
			cap: number | null;
			expectedWheelEvents: number;
			rareIntervalMs: number;
		}) => {
			globalThis.__debug132LiveMinCssPx = control.threshold;
			globalThis.__debug132LiveCap = control.cap ?? undefined;
			globalThis.__debug132ExpectedWheelEvents = control.expectedWheelEvents;
			globalThis.__debug132RareIntervalMs = control.rareIntervalMs;
		},
		{
			threshold: definition.threshold,
			cap: definition.cap,
			expectedWheelEvents: WHEEL_SCHEDULE.length,
			rareIntervalMs: RARE_INTERVAL_MS,
		},
	);
	const shouldTrace = traceDir !== undefined && identity.phase === "main";
	await context.addInitScript((enabled: boolean) => {
		globalThis.__debug132Trace = enabled;
	}, shouldTrace);
	await context.addInitScript(installCollector);

	const page = await context.newPage();
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	let cdp: CDPSession | undefined;
	let tracing = false;
	try {
		await page.goto(daemon.url, { waitUntil: "domcontentloaded" });
		await waitUntilReady(page, definition.expectedMounted);
		cdp = await context.newCDPSession(page);
		const traceName = shouldTrace
			? `pair-${String(identity.pair).padStart(2, "0")}-${identity.order}-${identity.position}-${identity.arm}-attempt-${identity.attempt}.json.gz`
			: null;
		if (traceName !== null && traceDir !== undefined) {
			mkdirSync(traceDir, { recursive: true });
			await cdp.send("Tracing.start", {
				transferMode: "ReturnAsStream",
				categories:
					"blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu,viz,benchmark",
			});
			tracing = true;
		}
		const window = await collectPageWindow(page, cdp, WHEEL_SCHEDULE, definition);
		if (traceName !== null && traceDir !== undefined) {
			await saveTrace(cdp, join(traceDir, traceName));
			tracing = false;
		}
		return buildRunRecord(
			identity,
			definition,
			browserVersion,
			cliSha256,
			distTreeSha256,
			window,
			pageErrors,
			traceName,
		);
	} finally {
		if (tracing && cdp !== undefined) await cdp.send("Tracing.end").catch(() => undefined);
		await context.close();
	}
}

function appendRecord(record: object): void {
	appendFileSync(output, `${JSON.stringify(record)}\n`);
}

function geometrySummary(records: readonly RunRecord[]) {
	const fullAreas = records.map((record) => requiredMetric(record.fullDrawnAreaCssPx2, "full drawn area"));
	const viewportAreas = records.map((record) =>
		requiredMetric(record.viewportIntersectionAreaCssPx2, "viewport intersection area"),
	);
	return {
		fullDrawnAreaCssPx2Mean: round(mean(fullAreas)),
		viewportIntersectionAreaCssPx2Mean: round(mean(viewportAreas)),
	};
}

const subject = inspectSubject();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, "");
const driverSha256 = sha256(driverPath);
const armA = comparison.arms[0];
const armB = comparison.arms[1];
const metadata = {
	kind: "metadata",
	driver: basename(driverPath),
	driverSha256,
	fixedPoint: FIXED_POINT,
	...subject,
	page: PAGE,
	frameCount: FRAME_COUNT,
	viewport: VIEWPORT,
	deviceScaleFactor: DEVICE_SCALE_FACTOR,
	comparison: comparisonName,
	comparisonMode: comparison.mode,
	arms: {
		A: { name: armA, ...ARM_DEFINITIONS[armA] },
		B: { name: armB, ...ARM_DEFINITIONS[armB] },
	},
	wheelSchedule: WHEEL_SCHEDULE,
	wheelScheduleSha256: WHEEL_SCHEDULE_SHA256,
	expectedEventSpanMs: EXPECTED_EVENT_SPAN_MS,
	eventSpanToleranceMs: EVENT_SPAN_TOLERANCE_MS,
	eventGapP95LimitMs: EVENT_GAP_P95_LIMIT_MS,
	eventGapMaxLimitMs: EVENT_GAP_MAX_LIMIT_MS,
	analysisWindowMs: ANALYSIS_WINDOW_MS,
	pairs: PAIRS,
	pilot: PILOT,
	order: "odd pairs AB; even pairs BA",
	warmups: "one discarded run per arm",
	equivalenceMarginMs: EQUIVALENCE_MARGIN_MS,
	equivalenceBasis: "half of the smallest reported old 5-8 ms penalty",
	rareIntervalMs: RARE_INTERVAL_MS,
	traceEnabled: traceDir !== undefined,
	traceScope: "main runs only",
	browserChannel: BROWSER_CHANNEL,
	expectedBrowserVersion: EXPECTED_BROWSER_VERSION,
	nodeVersion: process.version,
	platform: process.platform,
	architecture: process.arch,
};
appendRecord(metadata);

interface AcceptedPair {
	pair: number;
	order: Exclude<RunOrder, "warmup">;
	resultA: RunRecord;
	resultB: RunRecord;
	deltaMs: number;
}

const daemon = await startDaemon();
let browser: Browser | undefined;
const acceptedPairs: AcceptedPair[] = [];
try {
	const activeBrowser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: false });
	browser = activeBrowser;
	const browserVersion = activeBrowser.version();
	if (browserVersion !== EXPECTED_BROWSER_VERSION) {
		throw new Error(`browser is ${browserVersion}, expected ${EXPECTED_BROWSER_VERSION}`);
	}
	for (const [position, arm] of comparison.arms.entries()) {
		const warmup = await measureRun({
			browser: activeBrowser,
			daemon,
			browserVersion,
			cliSha256: subject.cliSha256,
			distTreeSha256: subject.distTreeSha256,
			identity: { arm, phase: "warmup", pair: 0, order: "warmup", position: position + 1, attempt: 1 },
		});
		appendRecord(warmup);
		process.stderr.write(
			`warmup ${arm}: p95 ${warmup.rafP95Ms} ms, mounted ${warmup.mountedMin}-${warmup.mountedMax}\n`,
		);
	}
	for (let pair = 1; pair <= PAIRS; pair++) {
		const order = pair % 2 === 1 ? "AB" : "BA";
		const arms: readonly ArmName[] = order === "AB" ? [armA, armB] : [armB, armA];
		let accepted: RunRecord[] | undefined;
		for (let attempt = 1; attempt <= MAX_PAIR_ATTEMPTS; attempt++) {
			const runs: RunRecord[] = [];
			for (const [position, arm] of arms.entries()) {
				runs.push(
					await measureRun({
						browser: activeBrowser,
						daemon,
						browserVersion,
						cliSha256: subject.cliSha256,
						distTreeSha256: subject.distTreeSha256,
						identity: { arm, phase: "main", pair, order, position: position + 1, attempt },
					}),
				);
			}
			const pairAccepted = runs.every((run) => run.accepted);
			for (const run of runs) appendRecord({ ...run, pairAccepted });
			if (pairAccepted) {
				accepted = runs;
				break;
			}
			process.stderr.write(`pair ${pair} attempt ${attempt} rejected\n`);
		}
		if (accepted === undefined) throw new Error(`pair ${pair} failed ${MAX_PAIR_ATTEMPTS} attempts`);
		const resultA = accepted.find((run) => run.arm === armA);
		const resultB = accepted.find((run) => run.arm === armB);
		if (resultA === undefined || resultB === undefined) throw new Error(`accepted pair ${pair} lost an arm`);
		const p95A = requiredMetric(resultA.rafP95Ms, `${armA} p95`);
		const p95B = requiredMetric(resultB.rafP95Ms, `${armB} p95`);
		acceptedPairs.push({ pair, order, resultA, resultB, deltaMs: p95B - p95A });
		process.stderr.write(
			`pair ${String(pair).padStart(2, "0")} ${order}: ${p95A} -> ${p95B} ms (${round(p95B - p95A)} ms)\n`,
		);
	}
} finally {
	try {
		if (browser !== undefined) await browser.close();
	} finally {
		await daemon.stop();
	}
}

const recordsA = acceptedPairs.map((pair) => pair.resultA);
const recordsB = acceptedPairs.map((pair) => pair.resultB);
const summaryBase = {
	kind: "summary",
	comparison: comparisonName,
	mode: comparison.mode,
	armA,
	armB,
	acceptedPairs: acceptedPairs.length,
	geometry: {
		armA: geometrySummary(recordsA),
		armB: geometrySummary(recordsB),
	},
};
let summary: object;
if (comparison.mode === "diagnostic") {
	summary = {
		...summaryBase,
		mounted: {
			armA: recordsA.map((record) => ({ count: record.mountedBefore, names: record.mountedNamesBefore })),
			armB: recordsB.map((record) => ({ count: record.mountedBefore, names: record.mountedNamesBefore })),
		},
		equalAreaControl: {
			requestedMountedAtEqualAreaZoom: 8,
			observedMountedAtEqualAreaZoom: [...new Set(recordsB.map((record) => record.mountedBefore))],
			valid: false,
			performanceInference: "not computed because the production live ring admits fewer than eight frames",
		},
	};
} else {
	const deltas = acceptedPairs.map((pair) => pair.deltaMs);
	const interval = pairedBootstrapMeanInterval(deltas);
	summary = {
		...summaryBase,
		abPairs: acceptedPairs.filter((pair) => pair.order === "AB").length,
		baPairs: acceptedPairs.filter((pair) => pair.order === "BA").length,
		pairedP95DeltaMs: {
			mean: round(mean(deltas)),
			median: round(percentile(deltas, 0.5)),
			min: round(percentile(deltas, 0)),
			max: round(percentile(deltas, 1)),
			bootstrap95: {
				low: round(interval.low),
				high: round(interval.high),
				draws: BOOTSTRAP_DRAWS,
				seed: 132,
			},
		},
		rareIntervals: {
			thresholdMs: RARE_INTERVAL_MS,
			armAOccurrences: recordsA.filter(
				(record) => requiredMetric(record.rafWorstMs, `${armA} worst rAF`) > RARE_INTERVAL_MS,
			).length,
			armBOccurrences: recordsB.filter(
				(record) => requiredMetric(record.rafWorstMs, `${armB} worst rAF`) > RARE_INTERVAL_MS,
			).length,
		},
		equivalenceMarginMs: EQUIVALENCE_MARGIN_MS,
		equivalent: interval.low > -EQUIVALENCE_MARGIN_MS && interval.high < EQUIVALENCE_MARGIN_MS,
		oldPenaltyExcluded: interval.high < 5,
	};
}
appendRecord(summary);
process.stdout.write(`${JSON.stringify(summary, null, "\t")}\n`);
