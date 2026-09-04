import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { getNested, mutateMachineState, setNested } from "../machine-state";
import { readMachineRegistry } from "../machine-state-files";
import {
	type AgentPermissions,
	isSettingKey,
	parseSetting,
	SETTING_KEYS,
	SETTINGS,
	type SettingKey,
	type SettingReading,
	type SettingsSnapshot,
	type SettingValue,
} from "../settings/registry";
import { CanvasFileError, canvasFile, readCanvasFields, writeCanvasField } from "./canvas-file";

/**
 * The three files a setting can live in, behind one read and one write (#281).
 *
 * Each file already has an owner and a shape, and the store adds a key to it
 * rather than a file beside it: `history` sits at the top of canvas.json where
 * #158 put it, a local setting nests under the project's registry entry, and a
 * machine setting nests in config.json by its dotted key (`theme.thread` is
 * `{ "theme": { "thread": ... } }`). A dotted key is a path, in every file.
 *
 * config.json was hand-written only until now, and the rule behind that was
 * about unasked writes: a program migrating or tidying a file it does not own.
 * A write here is a person moving one setting, so it changes that one key and
 * carries the rest through as they were. A file that does not parse is never
 * written, because the store cannot know what it would lose.
 */

export type SettingWrite =
	| { readonly ok: true; readonly reading: SettingReading }
	| { readonly ok: false; readonly status: 400 | 404 | 409; readonly reason: string };

export interface SettingsStore {
	/** every setting, for one project or for none; a project scope without a root reads as its default */
	read(root?: string): SettingsSnapshot;
	/** one setting, validated by its entry and written to the one file its scope names */
	write(key: string, raw: unknown, root?: string): SettingWrite;
	/** the fence a spawn for this project gets, read from the file at spawn time */
	agentPermissions(root: string): AgentPermissions;
}

export function createSettingsStore(spoolDir: string): SettingsStore {
	const configFile = join(spoolDir, "config.json");

	function held(key: SettingKey, root: string | undefined): unknown {
		const path = key.split(".");
		switch (SETTINGS[key].scope) {
			case "project":
				return root === undefined ? undefined : getNested(readCanvasFields(root), path);
			case "local": {
				if (root === undefined) return undefined;
				const project = readMachineRegistry(spoolDir).projects.find((candidate) => candidate.root === root);
				return getNested(project?.settings, path);
			}
			case "machine":
				return getNested(readConfig(configFile).fields, path);
		}
	}

	function reading<Key extends SettingKey>(key: Key, root: string | undefined): SettingReading<Key> {
		const entry = SETTINGS[key];
		const fallback = entry.fallback as SettingValue<Key>;
		const raw = held(key, root);
		// a value the file holds in a shape the entry refuses reads as the default:
		// a hand edit gone wrong is not a reason for the canvas to have no theme
		const parsed = raw === undefined ? undefined : parseSetting(key, raw);
		const value = parsed?.ok === true ? parsed.value : fallback;
		return {
			key,
			value,
			fallback,
			source: parsed?.ok === true ? "file" : "default",
			scope: entry.scope,
			group: entry.group,
			shape: entry.shape,
			label: entry.label,
			says: entry.says,
		};
	}

	return {
		read: (root) => ({ project: root ?? null, entries: SETTING_KEYS.map((key) => reading(key, root)) }),
		write: (key, raw, root) => {
			if (!isSettingKey(key)) return { ok: false, status: 404, reason: `no setting named "${key}"` };
			const parsed = parseSetting(key, raw);
			if (!parsed.ok) return { ok: false, status: 400, reason: parsed.reason };
			const path = key.split(".");
			const scope = SETTINGS[key].scope;
			if (scope !== "machine" && root === undefined) {
				return { ok: false, status: 400, reason: `"${key}" is a ${scope} setting and needs a project` };
			}
			switch (scope) {
				case "project": {
					try {
						writeCanvasField(canvasFile(root as string), key, parsed.value);
					} catch (error) {
						if (error instanceof CanvasFileError) return { ok: false, status: 409, reason: error.message };
						return { ok: false, status: 404, reason: `no design/ to write at ${root}` };
					}
					break;
				}
				case "local": {
					const result = mutateMachineState(spoolDir, {
						kind: "set-project-setting",
						root: root as string,
						path,
						value: parsed.value,
					});
					if (result.kind === "unregistered") {
						return { ok: false, status: 404, reason: `not a registered project root: ${result.root}` };
					}
					break;
				}
				case "machine": {
					const config = readConfig(configFile);
					if (config.kind === "unreadable") {
						return {
							ok: false,
							status: 409,
							reason: `${configFile} is not a JSON object, spool will not overwrite it`,
						};
					}
					writeAtomic(configFile, `${JSON.stringify(setNested(config.fields, path, parsed.value), null, "\t")}\n`);
					break;
				}
			}
			return { ok: true, reading: reading(key, root) };
		},
		agentPermissions: (root) => reading("agent.permissions", root).value,
	};
}

type Config =
	| { readonly kind: "read"; readonly fields: Record<string, unknown> }
	| { readonly kind: "absent"; readonly fields: Record<string, unknown> }
	| { readonly kind: "unreadable"; readonly fields: Record<string, unknown> };

/** config.json as a bag of keys; a corrupt file reads as empty and refuses a write. */
function readConfig(file: string): Config {
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch {
		return { kind: "absent", fields: {} };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { kind: "unreadable", fields: {} };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		return { kind: "unreadable", fields: {} };
	return { kind: "read", fields: parsed as Record<string, unknown> };
}
