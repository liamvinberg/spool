import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { getNested } from "../machine-state";
import { readMachineRegistry } from "../machine-state-files";
import { AGENT_ENGINE_IDS, type AgentEngineId, isAgentEngineId, LEGACY_ENGINE } from "./agent-engine";
import { type AgentAsk, isEffortShaped, isModelShaped } from "./agent-offer";
import { threadsDir } from "./agent-threads";

/**
 * The agent a person picked, once per machine (#361).
 *
 * Agent, model and effort per engine, and permission mode are one choice for this whole
 * install, like Claude Code's own: every new thread in every project starts from it, and
 * nothing but a person picking moves it. This module is the only place that reads, writes
 * or falls back for it. The file is spool's own (`agent.json` in the state directory),
 * never the project's and never the agent's.
 */

/**
 * Which engine a machine with nothing saved starts on: the first engine spool drives, in
 * their own order, that is registered and installed, else the first registered. The bundled
 * engine is never here.
 */
export const ENGINE_ORDER: readonly AgentEngineId[] = AGENT_ENGINE_IDS;

/**
 * How a spawned agent is fenced (#121, #281). `ask` is the fence as built: the allow rules
 * make design/ quiet and everything else asks. `edits` accepts file edits and still asks for
 * the rest. `bypass` hands the agent its own bypass mode. The mode is this machine's, never
 * the repo's, and is part of the agent choice this module keeps (#361).
 */
export const AGENT_PERMISSIONS = ["ask", "edits", "bypass"] as const;
export type AgentPermissions = (typeof AGENT_PERMISSIONS)[number];

/** A machine with nothing saved asks before commands and edits without asking. */
export const DEFAULT_MODE: AgentPermissions = "edits";

export interface EngineAvailability {
	readonly id: AgentEngineId;
	installed(): boolean;
}

/** The one fallback. Undefined only when no engine in the order is registered at all. */
export function fallbackEngine(engines: Iterable<EngineAvailability>): AgentEngineId | undefined {
	const registered = new Map([...engines].map((engine) => [engine.id, engine]));
	const ordered = ENGINE_ORDER.flatMap((id) => {
		const engine = registered.get(id);
		return engine === undefined ? [] : [engine];
	});
	return (ordered.find((engine) => engine.installed()) ?? ordered[0])?.id;
}

export interface AgentChoice {
	readonly engine: AgentEngineId | undefined;
	readonly mode: AgentPermissions;
}

interface Stored {
	readonly engine?: AgentEngineId;
	readonly mode?: AgentPermissions;
	readonly models?: Readonly<Record<string, AgentAsk>>;
	/** the per-project values were folded in once; they are never read again */
	readonly migrated?: true;
}

export interface AgentDefaults {
	/** the engine and mode a new thread starts on, with the fallback applied */
	read(): AgentChoice;
	/** the model and effort last chosen on this engine, or nothing for the engine's own default */
	model(engine: AgentEngineId): AgentAsk;
	/** each write is the person's pick, written before it is confirmed */
	setEngine(engine: AgentEngineId): AgentChoice;
	setMode(mode: AgentPermissions): AgentChoice;
	setModel(engine: AgentEngineId, ask: AgentAsk): void;
}

export function agentDefaultsFile(spoolDir: string): string {
	return join(spoolDir, "agent.json");
}

export function createAgentDefaults(spoolDir: string, engines: () => Iterable<EngineAvailability>): AgentDefaults {
	const file = agentDefaultsFile(spoolDir);
	/** what was last read or written, kept for a file that stops parsing */
	let known: Stored | undefined;

	function load(): Stored {
		let raw: string;
		try {
			raw = readFileSync(file, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") return known ?? { migrated: true };
			// first read on this machine: fold the per-project values in, once
			const migrated = migrateAgentDefaults(spoolDir);
			try {
				write(migrated);
			} catch {
				known = migrated;
			}
			return migrated;
		}
		const parsed = parseStored(raw);
		// a file that stopped parsing keeps the last value this daemon saw rather than falling back
		if (parsed === undefined) return known ?? { migrated: true };
		known = parsed;
		return parsed;
	}

	function write(next: Stored): void {
		const stored: Stored = { ...next, migrated: true };
		writeAtomic(file, `${JSON.stringify(stored, null, "\t")}\n`);
		known = stored;
	}

	function choice(stored: Stored): AgentChoice {
		const registered = [...engines()];
		const saved = stored.engine !== undefined && registered.some((engine) => engine.id === stored.engine);
		return {
			engine: saved ? stored.engine : fallbackEngine(registered),
			mode: stored.mode ?? DEFAULT_MODE,
		};
	}

	return {
		read: () => choice(load()),
		model: (engine) => load().models?.[engine] ?? {},
		setEngine: (engine) => {
			const next = { ...load(), engine };
			write(next);
			return choice(next);
		},
		setMode: (mode) => {
			const next = { ...load(), mode };
			write(next);
			return choice(next);
		},
		setModel: (engine, ask) => {
			const stored = load();
			write({ ...stored, models: { ...stored.models, [engine]: cleanAsk(ask) } });
		},
	};
}

function cleanAsk(value: unknown): AgentAsk {
	if (typeof value !== "object" || value === null) return {};
	const { value: model, effort } = value as { value?: unknown; effort?: unknown };
	return {
		...(isModelShaped(model) ? { value: model as string } : {}),
		...(isEffortShaped(effort) ? { effort: effort as string } : {}),
	};
}

function isMode(value: unknown): value is AgentPermissions {
	return typeof value === "string" && (AGENT_PERMISSIONS as readonly string[]).includes(value);
}

function parseStored(raw: string): Stored | undefined {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
	const record = data as Record<string, unknown>;
	const models: Record<string, AgentAsk> = {};
	if (typeof record.models === "object" && record.models !== null && !Array.isArray(record.models)) {
		for (const [engine, ask] of Object.entries(record.models)) models[engine] = cleanAsk(ask);
	}
	return {
		...(isAgentEngineId(record.engine) ? { engine: record.engine } : {}),
		...(isMode(record.mode) ? { mode: record.mode } : {}),
		models,
		migrated: true,
	};
}

/**
 * The per-project values from before #361, folded into one machine choice.
 *
 * The most recently written wins. Neither registry.json nor its project entries stamp a
 * setting's write, so the project's last open stands in for it there; a project's model
 * file has its own mtime. A saved bundled engine is not carried over: it is never a
 * fallback and its engine is on the way out.
 */
function migrateAgentDefaults(spoolDir: string): Stored {
	let projects: readonly { root: string; openedAt: string; settings?: Record<string, unknown> }[] = [];
	try {
		projects = readMachineRegistry(spoolDir).projects;
	} catch {
		/* an unreadable registry has nothing to migrate */
	}
	const recent = [...projects].sort((one, two) => Date.parse(two.openedAt) - Date.parse(one.openedAt));
	const engine = recent
		.map((project) => getNested(project.settings, ["agent", "engine"]))
		.find((value): value is AgentEngineId => isAgentEngineId(value));
	const mode = recent.map((project) => getNested(project.settings, ["agent", "permissions"])).find(isMode);
	const files = projects
		.map((project) => {
			const path = join(threadsDir(spoolDir, project.root), "models.json");
			try {
				const defaults = JSON.parse(readFileSync(path, "utf8"))?.defaults;
				return { at: statSync(path).mtimeMs, defaults };
			} catch {
				return undefined;
			}
		})
		.filter((one) => one !== undefined && typeof one.defaults === "object" && one.defaults !== null)
		.sort((one, two) => (two?.at ?? 0) - (one?.at ?? 0));
	const models: Record<string, AgentAsk> = {};
	for (const one of files) {
		for (const [id, ask] of Object.entries(one?.defaults as Record<string, unknown>)) {
			if (id === LEGACY_ENGINE || models[id] !== undefined) continue;
			const clean = cleanAsk(ask);
			if (clean.value !== undefined || clean.effort !== undefined) models[id] = clean;
		}
	}
	return {
		...(engine === undefined ? {} : { engine }),
		...(mode === undefined ? {} : { mode }),
		models,
		migrated: true,
	};
}
