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

export type SettingsWrite =
	| { readonly ok: true; readonly readings: readonly SettingReading[] }
	| { readonly ok: false; readonly status: 400 | 404 | 409; readonly reason: string };

export interface SettingsStore {
	/** every setting, for one project or for none; a project scope without a root reads as its default */
	read(root?: string): SettingsSnapshot;
	/** one setting, validated by its entry and written to the one file its scope names */
	write(key: string, raw: unknown, root?: string): SettingWrite;
	/**
	 * several at once, every one checked before any is written, and the ones
	 * that share a file written in one go: a theme is ten tokens and nobody
	 * should see nine of them land
	 */
	writeMany(writes: readonly { key: string; value: unknown }[], root?: string): SettingsWrite;
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

	type Checked = { key: SettingKey; value: unknown; path: string[] };

	function check(
		key: string,
		raw: unknown,
		root: string | undefined,
	): Checked | { status: 400 | 404; reason: string } {
		if (!isSettingKey(key)) return { status: 404, reason: `no setting named "${key}"` };
		// null unsets: the key comes out of its file and the entry reads as its
		// default again, so a reset is a removal rather than a stored copy
		const parsed = raw === null ? ({ ok: true, value: undefined } as const) : parseSetting(key, raw);
		if (!parsed.ok) return { status: 400, reason: parsed.reason };
		const scope = SETTINGS[key].scope;
		if (scope !== "machine" && root === undefined) {
			return { status: 400, reason: `"${key}" is a ${scope} setting and needs a project` };
		}
		return { key, value: parsed.value, path: key.split(".") };
	}

	/** the checked writes onto their files; the machine ones as one read-modify-write of config.json */
	function commit(
		checked: readonly Checked[],
		root: string | undefined,
	): { status: 404 | 409; reason: string } | undefined {
		const machine = checked.filter((write) => SETTINGS[write.key].scope === "machine");
		if (machine.length > 0) {
			const config = readConfig(configFile);
			if (config.kind === "unreadable") {
				return { status: 409, reason: `${configFile} is not a JSON object, spool will not overwrite it` };
			}
			let fields = config.fields;
			for (const write of machine) fields = setNested(fields, write.path, write.value);
			writeAtomic(configFile, `${JSON.stringify(fields, null, "\t")}\n`);
		}
		for (const write of checked) {
			switch (SETTINGS[write.key].scope) {
				case "project": {
					try {
						writeCanvasField(canvasFile(root as string), write.key, write.value);
					} catch (error) {
						if (error instanceof CanvasFileError) return { status: 409, reason: error.message };
						return { status: 404, reason: `no design/ to write at ${root}` };
					}
					break;
				}
				case "local": {
					const result = mutateMachineState(spoolDir, {
						kind: "set-project-setting",
						root: root as string,
						path: write.path,
						value: write.value,
					});
					if (result.kind === "unregistered") {
						return { status: 404, reason: `not a registered project root: ${result.root}` };
					}
					break;
				}
				case "machine":
					break;
			}
		}
		return undefined;
	}

	function writeMany(writes: readonly { key: string; value: unknown }[], root: string | undefined): SettingsWrite {
		const checked: Checked[] = [];
		for (const write of writes) {
			const result = check(write.key, write.value, root);
			if ("reason" in result) return { ok: false, ...result };
			checked.push(result);
		}
		const refused = commit(checked, root);
		if (refused !== undefined) return { ok: false, ...refused };
		return { ok: true, readings: checked.map((write) => reading(write.key, root)) };
	}

	return {
		read: (root) => ({ project: root ?? null, entries: SETTING_KEYS.map((key) => reading(key, root)) }),
		write: (key, raw, root) => {
			const written = writeMany([{ key, value: raw }], root);
			if (!written.ok) return written;
			return { ok: true, reading: written.readings[0] as SettingReading };
		},
		writeMany,
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
