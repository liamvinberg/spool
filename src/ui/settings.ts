import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
	appearanceOf,
	type SettingKey,
	type SettingPrimitive,
	type SettingReading,
	type SettingsSnapshot,
	type SettingValue,
	themeInline,
} from "../settings/registry";
import { fetchSettings, putSetting, putSettings } from "./api";

/**
 * The settings the canvas reads, live (#281).
 *
 * One snapshot per project name (and one for none), fetched on first ask and
 * refetched when the daemon says a setting moved, so every page on this
 * machine sees the same value at the same moment. Nothing here is remembered
 * in the browser: a setting is a fact about the install or the project, and
 * `remembered.ts` is for the other kind.
 *
 * A theme lands on `:root` as the custom properties the stylesheet already
 * declares, which is the whole reason the chrome is built on those tokens:
 * setting `--color-thread` recolours every thread without a class changing
 * hands. The daemon writes the same properties ahead of first paint, so this
 * side only has to keep them current.
 */

const snapshots = new Map<string, SettingsSnapshot>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();

const keyOf = (project: string | undefined) => project ?? "";

function notify(): void {
	for (const listener of listeners) listener();
}

async function load(project: string | undefined): Promise<void> {
	const key = keyOf(project);
	const pending = inFlight.get(key);
	if (pending !== undefined) return pending;
	const task = fetchSettings(project).then((snapshot) => {
		inFlight.delete(key);
		if (snapshot === undefined) return;
		snapshots.set(key, snapshot);
		if (project === undefined) applyTheme(snapshot.entries);
		notify();
	});
	inFlight.set(key, task);
	return task;
}

/** Every snapshot goes stale at once: a machine setting is on every page's reading. */
export function settingsMoved(): void {
	for (const key of snapshots.keys()) void load(key === "" ? undefined : key);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The settings for one project, or the machine's alone; `undefined` until the first read lands. */
export function useSettings(project?: string): SettingsSnapshot | undefined {
	const key = keyOf(project);
	const snapshot = useSyncExternalStore(
		subscribe,
		() => snapshots.get(key),
		() => undefined,
	);
	useEffect(() => {
		if (!snapshots.has(key)) void load(project);
	}, [key, project]);
	return snapshot;
}

/** One setting's value, its default until the read lands. */
export function useSetting<Key extends SettingKey>(key: Key, project?: string): SettingValue<Key> | undefined {
	const snapshot = useSettings(project);
	const entry = snapshot?.entries.find((candidate) => candidate.key === key);
	return entry === undefined ? undefined : (entry.value as SettingValue<Key>);
}

/**
 * Move one setting, or unset it with `null` so it reads as its default again.
 * The daemon's event brings the new reading back to every page, this one included.
 */
export function useWriteSetting(project?: string) {
	return useCallback(
		(key: SettingKey, value: SettingPrimitive | null) =>
			putSetting(key, value, project).then((written) => {
				if (written.ok) settingsMoved();
				return written;
			}),
		[project],
	);
}

/** Move several settings as one; a theme is ten tokens and lands as ten or none. */
export function useWriteSettings(project?: string) {
	return useCallback(
		(writes: readonly { key: SettingKey; value: SettingPrimitive | null }[]) =>
			putSettings(writes, project).then((written) => {
				if (written.ok) settingsMoved();
				return written;
			}),
		[project],
	);
}

/**
 * The theme, onto the document: the look as `data-appearance` and the moved
 * tokens as the inline style, the same two the daemon stamps ahead of first
 * paint. A token at its default is taken off rather than written back, so the
 * stylesheet's own light-dark() value shows through and a reset is a removal,
 * never a second copy of the default.
 */
export function applyTheme(entries: readonly SettingReading[], root: HTMLElement = document.documentElement): void {
	root.setAttribute("data-appearance", appearanceOf(entries));
	const inline = themeInline(entries);
	if (inline === "") root.removeAttribute("style");
	else root.setAttribute("style", inline);
}
